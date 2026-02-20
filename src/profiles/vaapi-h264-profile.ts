import type { EncoderOptionsBuilderParams } from '@peertube/peertube-types'
import { VaapiTranscodingProfile } from './transcoding-profile'

export class VaapiH264Profile extends VaapiTranscodingProfile {
  protected encoder = 'h264_vaapi'
  protected profileName = 'VAAPI H264'
  protected priority = 1000

  protected buildVodOutputOptions(_params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string, maxrateMultiplier: number): string[] {
    return [
      `-b:v${streamSuffix} ${targetBitrate}`,
      `-maxrate:v${streamSuffix} ${Math.floor(targetBitrate * maxrateMultiplier)}`,
      `-bufsize:v${streamSuffix} ${targetBitrate * 2}`
    ]
  }

  protected buildLiveOutputOptions(params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string, maxrateMultiplier: number): string[] {
    const { fps } = params

    return [
      `-r:v${streamSuffix} ${fps}`,
      `-profile:v${streamSuffix} high`,
      `-level:v${streamSuffix} 3.1`,
      `-g:v${streamSuffix} ${fps * 2}`,
      `-b:v${streamSuffix} ${targetBitrate}`,
      `-maxrate:v${streamSuffix} ${Math.floor(targetBitrate * maxrateMultiplier)}`,
      `-bufsize:v${streamSuffix} ${targetBitrate * 2}`
    ]
  }
}
