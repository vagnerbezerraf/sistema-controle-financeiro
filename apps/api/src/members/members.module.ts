import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../common/auth/auth.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { SpaceInvitesController } from './space-invites.controller';

@Module({
  imports: [AuthCommonModule],
  controllers: [MembersController, SpaceInvitesController],
  providers: [MembersService],
})
export class MembersModule {}
