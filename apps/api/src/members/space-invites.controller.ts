import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, type AuthenticatedUser } from '../common/auth/auth.guard';
import { MembersService } from './members.service';
import { AcceptSpaceInviteRequest } from './http/dto';

/**
 * Aceite de convite: nao pertence a um espaco ainda, entao fica fora do prefixo
 * `financial-spaces/:spaceId` (o usuario autenticado apresenta apenas o token).
 */
@ApiTags('members')
@Controller('space-invites')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class SpaceInvitesController {
  constructor(private readonly members: MembersService) {}

  @Post('accept')
  @ApiOperation({ summary: 'Aceitar um convite e ingressar no espaco financeiro' })
  accept(@Body() body: AcceptSpaceInviteRequest, @CurrentUser() user: AuthenticatedUser) {
    return this.members.acceptInvite(user.sub, user.email, body.token);
  }
}
