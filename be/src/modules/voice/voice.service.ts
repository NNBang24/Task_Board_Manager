import { Injectable } from '@nestjs/common';
import { CreateVoiceDto } from './dto/create-voice.dto';
import { UpdateVoiceDto } from './dto/update-voice.dto';

@Injectable()
export class VoiceService {
  create(createVoiceDto: CreateVoiceDto) {
    return 'This action adds a new voice';
  }

  findAll() {
    return `This action returns all voice`;
  }

  findOne(id: number) {
    return `This action returns a #${id} voice`;
  }

  update(id: number, updateVoiceDto: UpdateVoiceDto) {
    return `This action updates a #${id} voice`;
  }

  remove(id: number) {
    return `This action removes a #${id} voice`;
  }
}
