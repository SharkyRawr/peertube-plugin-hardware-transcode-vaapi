import { EncoderOptionsBuilderParams } from '@peertube/peertube-types'
import { VaapiTranscodingProfile } from './transcoding-profile'

export class VaapiH264Profile extends VaapiTranscodingProfile {
  protected encoder = 'h264_vaapi'
  protected profileName = 'VAAPI H264'
  protected priority = 1000

  protected buildVodOutputOptions(_params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string): string[] {
    return [
      `-b:v${streamSuffix} ${targetBitrate}`,
      `-maxrate:v${streamSuffix} ${Math.floor(targetBitrate * 1.5)}`,
      `-bufsize:v${streamSuffix} ${targetBitrate * 2}`
    ]
  }

  protected buildLiveOutputOptions(params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string): string[] {
    const { fps } = params

    return [
      `-r:v${streamSuffix} ${fps}`,
      `-profile:v${streamSuffix} high`,
      `-level:v${streamSuffix} 3.1`,
      `-g:v${streamSuffix} ${fps * 2}`,
      `-b:v${streamSuffix} ${targetBitrate}`,
      `-maxrate:v${streamSuffix} ${Math.floor(targetBitrate * 1.5)}`,
      `-bufsize:v${streamSuffix} ${targetBitrate * 2}`
    ]
  }
}
