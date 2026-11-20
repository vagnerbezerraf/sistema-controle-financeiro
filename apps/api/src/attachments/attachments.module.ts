import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [AuthCommonModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
