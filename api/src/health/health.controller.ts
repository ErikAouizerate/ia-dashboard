import { Controller, Get, Inject } from "@nestjs/common";
import { OPENCODE_READER } from "../opencode/opencode.module";
import { SessionReader } from "../opencode/opencode.types";

@Controller("health")
export class HealthController {
  constructor(@Inject(OPENCODE_READER) private readonly reader: SessionReader) {}

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