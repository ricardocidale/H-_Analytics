import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  Microphone, MicrophoneSlash, MusicNote, Waveform,
  SpeakerSimpleNone, SpeakerSimpleLow, SpeakerSimpleHigh, SpeakerSimpleX,
  Play, Pause, PlayCircle, SkipBack, SkipForward,
  ChatCircle, ChatSquare, ChatText, PaperPlaneRight,
  ArrowSquareOut, Link, Phone, PhoneDisconnect, Radio, Subtitles,
  Robot, Brain, Sparkle, MagicWand, Lightning, Camera,
} from "@phosphor-icons/react";

const wd = (I: Icon) =>
  ({ weight = "duotone" as IconWeight, ...p }: IconProps) => <I weight={weight} {...p} />;

export const IconMic = wd(Microphone);
export const IconMic2 = wd(Microphone);
export const IconMicOff = wd(MicrophoneSlash);
export const IconMusic = wd(MusicNote);
export const IconMusic2 = wd(MusicNote);
export const IconAudioLines = wd(Waveform);
export const IconVolume = wd(SpeakerSimpleNone);
export const IconVolume1 = wd(SpeakerSimpleLow);
export const IconVolume2 = wd(SpeakerSimpleHigh);
export const IconVolumeX = wd(SpeakerSimpleX);
export const IconPlay = wd(Play);
export const IconPause = wd(Pause);
export const IconPlayCircle = wd(PlayCircle);
export const IconSkipBack = wd(SkipBack);
export const IconSkipForward = wd(SkipForward);
export const IconMessageCircle = wd(ChatCircle);
export const IconMessageSquare = wd(ChatSquare);
export const IconMessageSquareText = wd(ChatText);
export const IconSend = wd(PaperPlaneRight);
export const IconExternalLink = wd(ArrowSquareOut);
export const IconLink = wd(Link);
export const IconPhone = wd(Phone);
export const IconPhoneOff = wd(PhoneDisconnect);
export const IconRadio = wd(Radio);
export const IconCaptions = wd(Subtitles);
export const IconBot = wd(Robot);
export const IconBrain = wd(Brain);
export const IconSparkles = wd(Sparkle);
export const IconWand2 = wd(MagicWand);
export const IconZap = wd(Lightning);
export const IconCamera = wd(Camera);
