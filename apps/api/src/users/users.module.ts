import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BootstrapAdminService } from './bootstrap-admin.service';

@Module({ imports: [AuthModule], providers: [BootstrapAdminService] })
export class UsersModule {}
