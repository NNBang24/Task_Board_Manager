import { PartialType } from '@nestjs/mapped-types';
import { CreateVoiceDto } from './create-voice.dto';

export class UpdateVoiceDto extends PartialType(CreateVoiceDto) {}
