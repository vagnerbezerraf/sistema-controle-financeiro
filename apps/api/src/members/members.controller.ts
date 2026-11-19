import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  SpaceRoleGuard,
  type AuthenticatedUser,
} from '../common/auth/auth.guard';
import { MembersService } from './members.service';
import { CreateSpaceInviteRequest, UpdateMemberRoleRequest } from './http/dto';

@ApiTags('members')
@Controller('financial-spaces/:spaceId')
@UseGuards(JwtAuthGuard, SpaceRoleGuard)
@ApiBearerAuth('access-token')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  @Roles(['owner', 'admin', 'contributor', 'viewer'])
  @ApiOperation({ summary: 'Listar membros do espaco financeiro' })
  listMembers(@Param('spaceId') spaceId: string) {
    return this.members.listMembers(spaceId);
  }

  @Patch('members/:memberId')
  @Roles(['owner', 'admin'])
  @ApiOperation({ summary: 'Alterar o papel de um membro (owner/admin)' })
  changeRole(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRoleRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.members.changeMemberRole(spaceId, user.sub, memberId, body.role);
  }

  @Delete('members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(['owner', 'admin'])
  @ApiOperation({ summary: 'Remover um membro do espaco financeiro (owner/admin)' })
  async removeMember(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.members.removeMember(spaceId, user.sub, memberId);
  }

  @Get('invites')
  @Roles(['owner', 'admin'])
  @ApiOperation({ summary: 'Listar convites pendentes (owner/admin)' })
  listInvites(@Param('spaceId') spaceId: string) {
    return this.members.listInvites(spaceId);
  }

  @Post('invites')
  @Roles(['owner', 'admin'])
  @ApiOperation({ summary: 'Convidar um e-mail para o espaco financeiro (owner/admin)' })
  invite(
    @Param('spaceId') spaceId: string,
    @Body() body: CreateSpaceInviteRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.members.createInvite(spaceId, user.sub, body);
  }

  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(['owner', 'admin'])
  @ApiOperation({ summary: 'Revogar um convite pendente (owner/admin)' })
  async revokeInvite(
    @Param('spaceId') spaceId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.members.revokeInvite(spaceId, user.sub, inviteId);
  }
}
