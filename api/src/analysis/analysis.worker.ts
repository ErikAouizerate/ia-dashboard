import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AnalysisService } from "./analysis.service";

@Injectable()
export class AnalysisWorker implements OnModuleInit {
  private readonly logger = new Logger(AnalysisWorker.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(AnalysisService) private readonly svc: AnalysisService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.ANALYSIS_DISABLED === "true") return;
    try {
      const recovered = await this.svc.recoverStuck();
      if (recovered > 0) {
        this.logger.log(`Recovered ${recovered} stuck session analysis(es)`);
      }
    } catch (e) {
      this.logger.warn(`Analysis recovery failed: ${String(e)}`);
    }
    try {
      const queued = await this.svc.queueBackfill(2);
      this.logger.log(`Analysis backfill queued ${queued} session(s)`);
    } catch (e) {
      this.logger.warn(`Analysis backfill failed: ${String(e)}`);
    }
    this.timer = setInterval(() => {
      this.svc.tick().catch((e) => this.logger.warn(`Analysis tick failed: ${String(e)}`));
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}