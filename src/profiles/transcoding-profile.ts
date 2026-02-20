import { EncoderOptionsBuilderParams } from '@peertube/peertube-types'

export type EncoderOutputOptionsBuilder = (params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string) => string[]

export interface TranscodingProfileDefinition {
  encoder: string
  profileName: string
  priority: number
  vodOutputOptionsBuilder: EncoderOutputOptionsBuilder
  liveOutputOptionsBuilder: EncoderOutputOptionsBuilder
}

export abstract class VaapiTranscodingProfile {
  protected abstract encoder: string
  protected abstract profileName: string
  protected abstract priority: number

  getDefinition(): TranscodingProfileDefinition {
    return {
      encoder: this.encoder,
      profileName: this.profileName,
      priority: this.priority,
      vodOutputOptionsBuilder: this.buildVodOutputOptions.bind(this),
      liveOutputOptionsBuilder: this.buildLiveOutputOptions.bind(this)
    }
  }

  protected abstract buildVodOutputOptions(params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string): string[]
  protected abstract buildLiveOutputOptions(params: EncoderOptionsBuilderParams, targetBitrate: number, streamSuffix: string): string[]
}
