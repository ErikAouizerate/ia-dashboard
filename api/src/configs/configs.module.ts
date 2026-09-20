import { Module } from "@nestjs/common";
import { ConfigsController } from "./configs.controller";

@Module({ controllers: [ConfigsController] })
export class ConfigsModule {}
