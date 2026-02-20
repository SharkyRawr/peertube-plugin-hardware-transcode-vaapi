import { PluginSettingsManager, PluginTranscodingManager } from "@peertube/peertube-types"
import { EncoderOptions, EncoderOptionsBuilderParams, RegisterServerOptions, VideoResolution } from "@peertube/peertube-types"
import type { VideoResolutionType } from "@peertube/peertube-types"
import { Logger } from 'winston'
import { VaapiH264Profile } from './profiles/vaapi-h264-profile'
import { VaapiH265Profile } from './profiles/vaapi-h265-profile'
import type { TranscodingProfileDefinition } from './profiles/transcoding-profile'

let logger : Logger
let transcodingManager : PluginTranscodingManager

const DEFAULT_HARDWARE_DECODE : boolean = false
const DEFAULT_QUALITY : number = -1
const DEFAULT_MAXRATE_MULTIPLIER : number = 1.5
const DEFAULT_BITRATES : Map<VideoResolutionType, number> = new Map([
    [VideoResolution.H_NOVIDEO, 64 * 1000],
    [VideoResolution.H_144P, 320 * 1000],
    [VideoResolution.H_360P, 780 * 1000],
    [VideoResolution.H_480P, 1500 * 1000],
    [VideoResolution.H_720P, 2800 * 1000],
    [VideoResolution.H_1080P, 5200 * 1000],
    [VideoResolution.H_1440P, 10_000 * 1000],
    [VideoResolution.H_4K, 22_000 * 1000]
])

interface PluginSettings {
    hardwareDecode : boolean
    quality: number
    maxrateMultiplier: number
    baseBitrate: Map<VideoResolutionType, number>
}
let pluginSettings : PluginSettings = {
    hardwareDecode: DEFAULT_HARDWARE_DECODE,
    quality: DEFAULT_QUALITY,
    maxrateMultiplier: DEFAULT_MAXRATE_MULTIPLIER,
    baseBitrate: new Map(DEFAULT_BITRATES)
}

let latestStreamNum = 9999

const TRANSCODING_PROFILES: TranscodingProfileDefinition[] = [
    new VaapiH264Profile().getDefinition(),
    new VaapiH265Profile().getDefinition()
]

export async function register({settingsManager, peertubeHelpers, transcodingManager: transcode, registerSetting} :RegisterServerOptions) {
    logger = peertubeHelpers.logger
    transcodingManager = transcode

    logger.info("Registering peertube-plugin-hardware-encode");

    registerSetting({
        name: 'hardware-decode',
        label: 'Hardware decode',

        type: 'input-checkbox',

        descriptionHTML: 'Use hardware video decoder instead of software decoder. This will slightly improve performance but may cause some issues with some videos. If you encounter issues, disable this option and restart failed jobs.',

        default: DEFAULT_HARDWARE_DECODE,
        private: false
    })
    registerSetting({
        name: 'quality',
        label: 'Quality',

        type: 'select',
        options: [
            { label: 'Automatic', value: '-1' },
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '4', value: '4' },
            { label: '5', value: '5' },
            { label: '6', value: '6' },
            { label: '7', value: '7' }
        ],

        descriptionHTML: 'This parameter controls the speed / quality tradeoff. Lower values mean better quality but slower encoding. Higher values mean faster encoding but lower quality. This setting is hardware dependent, you may need to experiment to find the best value for your hardware. Some hardware may have less than 7 levels of compression.',

        default: DEFAULT_QUALITY.toString(),
        private: false
    })

    registerSetting({
        name: 'maxrate-multiplier',
        label: 'VBR maxrate multiplier',

        type: 'input',

        descriptionHTML: 'Multiplier applied to target bitrate to set FFmpeg maxrate for constrained VBR. For example, 1.5 means maxrate is 150% of target bitrate. Values lower than 1 are ignored and replaced by the default.',

        default: DEFAULT_MAXRATE_MULTIPLIER.toString(),
        private: false
    })

    registerSetting({
        name: 'base-bitrate-description',
        label: 'Base bitrate',

        type: 'html',
        html: '',
        descriptionHTML: `The base bitrate for video in bits. We take the min bitrate between the bitrate setting and video bitrate.<br/>This is the bitrate used when the video is transcoded at 30 FPS. The bitrate will be scaled linearly between this value and the maximum bitrate when the video is transcoded at 60 FPS. Wrong values are replaced by default values.`,
           
        private: true,
    })
    for (const [resolution, bitrate] of DEFAULT_BITRATES) {
        logger.info("registering bitrate setting: " + bitrate.toString())
        registerSetting({
            name: `base-bitrate-${resolution}`,
            label: `Base bitrate for ${printResolution(resolution)}`,

            type: 'input',

            default: DEFAULT_BITRATES.get(resolution)?.toString(),
            descriptionHTML: `Default value: ${DEFAULT_BITRATES.get(resolution)}`,

            private: false
        })
    }

    // Load existing settings and default to constants if not present
    await loadSettings(settingsManager)

    settingsManager.onSettingsChange(async (_settings) => {
        await loadSettings(settingsManager)
    })

    try {
        registerTranscodingProfiles()
    } catch (error) {
        logger.error(`Unable to register VAAPI transcoding profiles: ${String(error)}`)
    }
}

export async function unregister() {
    logger.info("Unregistering peertube-plugin-hardware-encode")
    transcodingManager.removeAllProfilesAndEncoderPriorities()
    return true
}

async function loadSettings(settingsManager: PluginSettingsManager) {
    const hardwareDecodeRaw = await getSettingOrDefault(settingsManager, 'hardware-decode', DEFAULT_HARDWARE_DECODE)
    pluginSettings.hardwareDecode = hardwareDecodeRaw === true || hardwareDecodeRaw === 'true'

    const qualityRaw = await getSettingOrDefault(settingsManager, 'quality', DEFAULT_QUALITY.toString())
    pluginSettings.quality = parseInt(String(qualityRaw)) || DEFAULT_QUALITY

    const maxrateMultiplierRaw = await getSettingOrDefault(settingsManager, 'maxrate-multiplier', DEFAULT_MAXRATE_MULTIPLIER.toString())
    const maxrateMultiplier = parseFloat(String(maxrateMultiplierRaw))
    pluginSettings.maxrateMultiplier = Number.isFinite(maxrateMultiplier) && maxrateMultiplier >= 1
        ? maxrateMultiplier
        : DEFAULT_MAXRATE_MULTIPLIER

    for (const [resolution, bitrate] of DEFAULT_BITRATES) {
        const key = `base-bitrate-${resolution}`
        const storedValue = await getSettingOrDefault(settingsManager, key, bitrate.toString())
        pluginSettings.baseBitrate.set(resolution, parseInt(String(storedValue)) || bitrate)
        logger.info(`Bitrate ${printResolution(resolution)}: ${pluginSettings.baseBitrate.get(resolution)}`)
    }

    logger.info(`Hardware decode: ${pluginSettings.hardwareDecode}`)
    logger.info(`Quality: ${pluginSettings.quality}`)
    logger.info(`VBR maxrate multiplier: ${pluginSettings.maxrateMultiplier}`)
}

async function getSettingOrDefault(
    settingsManager: PluginSettingsManager,
    key: string,
    defaultValue: string | boolean
) : Promise<string | boolean> {
    try {
        const value = await settingsManager.getSetting(key)
        return value === undefined || value === null ? defaultValue : value
    } catch (error) {
        logger.warn(`Unable to load setting "${key}", using default. ${String(error)}`)
        return defaultValue
    }
}

function printResolution(resolution : VideoResolutionType) : string {
    switch (resolution) {
        case VideoResolution.H_NOVIDEO: return 'audio only'
        case VideoResolution.H_144P:
        case VideoResolution.H_360P:
        case VideoResolution.H_480P:
        case VideoResolution.H_720P:
        case VideoResolution.H_1080P:
        case VideoResolution.H_1440P:
            return `${resolution}p`
        case VideoResolution.H_4K: return '4K'

        default: return 'Unknown'
    }
}

function buildInitOptions() {
    if (pluginSettings.hardwareDecode) {
        return [
            '-hwaccel vaapi',
            '-vaapi_device /dev/dri/renderD128',
            '-hwaccel_output_format vaapi',
        ]
    } else {
        return [
            '-vaapi_device /dev/dri/renderD128'
        ]
    }
}

function registerTranscodingProfiles() {
    for (const profile of TRANSCODING_PROFILES) {
        transcodingManager.addVODProfile(profile.encoder, profile.profileName, createProfileBuilder(profile.vodOutputOptionsBuilder))
        transcodingManager.addVODEncoderPriority('video', profile.encoder, profile.priority)

        transcodingManager.addLiveProfile(profile.encoder, profile.profileName, createProfileBuilder(profile.liveOutputOptionsBuilder))
        transcodingManager.addLiveEncoderPriority('video', profile.encoder, profile.priority)
    }
}

function createProfileBuilder(outputOptionsBuilder: TranscodingProfileDefinition['vodOutputOptionsBuilder']) {
    return async (params: EncoderOptionsBuilderParams): Promise<EncoderOptions> => {
        const { resolution, fps, streamNum, inputBitrate } = params
        const streamSuffix = streamNum == undefined ? '' : `:${streamNum}`
        let targetBitrate = getTargetBitrate(resolution as VideoResolutionType, fps)
        const shouldInitVaapi = (streamNum == undefined || streamNum <= latestStreamNum)

        if (targetBitrate > inputBitrate) {
            targetBitrate = inputBitrate
        }

        logger.info(`Building encoder options, received ${JSON.stringify(params)}`)

        if (shouldInitVaapi && streamNum != undefined) {
            latestStreamNum = streamNum
        }

        const options: EncoderOptions = {
            scaleFilter: {
                // software decode requires specifying pixel format for hardware filter and upload it to GPU
                name: pluginSettings.hardwareDecode ? 'scale_vaapi' : 'format=nv12,hwupload,scale_vaapi'
            },
            inputOptions: shouldInitVaapi ? buildInitOptions() : [],
            outputOptions: [
                `-quality ${pluginSettings.quality}`,
                ...outputOptionsBuilder(params, targetBitrate, streamSuffix, pluginSettings.maxrateMultiplier)
            ]
        }

        logger.info(`EncoderOptions: ${JSON.stringify(options)}`)
        return options
    }
}

/**
 * Calculate the target bitrate based on video resolution and FPS.
 *
 * The calculation is based on two values:
 * Bitrate at VideoTranscodingFPS.AVERAGE is always the same as
 * getBaseBitrate(). Bitrate at VideoTranscodingFPS.MAX is always
 * getBaseBitrate() * 1.4. All other values are calculated linearly
 * between these two points.
 */
function getTargetBitrate (resolution : VideoResolutionType, fps : number) : number {
    const baseBitrate = pluginSettings.baseBitrate.get(resolution) || 0
    // The maximum bitrate, used when fps === VideoTranscodingFPS.MAX
    // Based on numbers from Youtube, 60 fps bitrate divided by 30 fps bitrate:
    //  720p: 2600 / 1750 = 1.49
    // 1080p: 4400 / 3300 = 1.33
    const maxBitrate = baseBitrate * 1.4
    const maxBitrateDifference = maxBitrate - baseBitrate
    const maxFpsDifference = 60 - 30
    // For 1080p video with default settings, this results in the following formula:
    // 3300 + (x - 30) * (1320/30)
    // Example outputs:
    // 1080p10: 2420 kbps, 1080p30: 3300 kbps, 1080p60: 4620 kbps
    //  720p10: 1283 kbps,  720p30: 1750 kbps,  720p60: 2450 kbps
    return Math.floor(baseBitrate + (fps - 30) * (maxBitrateDifference / maxFpsDifference))
}
