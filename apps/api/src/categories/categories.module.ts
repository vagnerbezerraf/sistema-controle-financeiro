import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { AuthCommonModule } from '../common/auth/auth.module';

@Module({
  imports: [AuthCommonModule],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
