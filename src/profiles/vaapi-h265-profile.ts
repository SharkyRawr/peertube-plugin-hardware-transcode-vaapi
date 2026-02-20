import { EncoderOptionsBuilderParams } from '@peertube/peertube-types'
import { VaapiTranscodingProfile } from './transcoding-profile'

export class VaapiH265Profile extends VaapiTranscodingProfile {
  protected encoder = 'hevc_vaapi'
  protected profileName = 'VAAPI H265'
  protected priority = 900

  protected buildVodOutputOptions(params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string): string[] {
    const { fps } = params

    return [
      `-profile:v${streamSuffix} main`,
      `-g:v${streamSuffix} ${fps * 2}`,
      `-keyint_min:v${streamSuffix} ${fps * 2}`,
      `-bf:v${streamSuffix} 2`,
      `-b:v${streamSuffix} ${targetBitrate}`,
      `-maxrate:v${streamSuffix} ${Math.floor(targetBitrate * 1.5)}`,
      `-bufsize:v${streamSuffix} ${targetBitrate * 2}`
    ]
  }

  protected buildLiveOutputOptions(params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string): string[] {
    const { fps } = params

    return [
      `-r:v${streamSuffix} ${fps}`,
      `-profile:v${streamSuffix} main`,
      `-g:v${streamSuffix} ${fps * 2}`,
      `-keyint_min:v${streamSuffix} ${fps * 2}`,
      `-bf:v${streamSuffix} 2`,
      `-b:v${streamSuffix} ${targetBitrate}`,
      `-maxrate:v${streamSuffix} ${Math.floor(targetBitrate * 1.5)}`,
      `-bufsize:v${streamSuffix} ${targetBitrate * 2}`
    ]
  }
}
