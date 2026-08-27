import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { FeaturesService } from "./features.service";
import { CreateFeatureDto, UpdateFeatureDto } from "./dto";

@Controller("features")
export class FeaturesController {
  constructor(private readonly svc: FeaturesService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() body: CreateFeatureDto) {
    return this.svc.create(body);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateFeatureDto) {
    return this.svc.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }

  @Post(":id/sessions")
  link(@Param("id") id: string, @Body() body: { sessionId: string }) {
    return this.svc.linkSession(id, body.sessionId);
  }

  @Post(":id/sessions/bulk")
  bulkLink(@Param("id") id: string, @Body() body: { sessionIds: string[] }) {
    return this.svc.bulkLinkSessions(id, body.sessionIds);
  }

  @Delete(":id/sessions/:sessionId")
  unlink(@Param("id") id: string, @Param("sessionId") sessionId: string) {
    return this.svc.unlinkSession(id, sessionId);
  }

  @Post(":id/sessions/:sessionId/resync")
  resync(@Param("id") id: string, @Param("sessionId") sessionId: string) {
    return this.svc.resyncSession(id, sessionId);
  }
}