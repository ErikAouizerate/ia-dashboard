import { Controller, Get, Inject } from "@nestjs/common";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { OpenCodeReader } from "../opencode/opencode-reader";

@Controller("health")
export class HealthController {
  constructor(@Inject(OPENCODE_READER) private readonly reader: OpenCodeReader) {}

  @Get()
  health() {
    let opencode = "ok";
    try {
      this.reader.open();
    } catch {
      opencode = "missing";
    }
    return { status: "ok", opencode };
  }
}