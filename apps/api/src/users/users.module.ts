import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [BootstrapAdminService, UsersService],
})
export class UsersModule {}
