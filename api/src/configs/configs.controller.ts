import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { MultiSourceReader } from "../opencode/multi-source-reader";

@Controller("configs")
export class ConfigsController {
  constructor(@Inject(OPENCODE_READER) private readonly reader: MultiSourceReader) {}

  @Get()
  list() {
    return this.reader.listConfigs();
  }

  @Get(":configId")
  get(@Param("configId") configId: string) {
    const config = this.reader.getConfig(configId);
    if (!config) throw new NotFoundException("Config not found");
    return config;
  }
}
