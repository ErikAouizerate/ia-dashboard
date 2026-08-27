import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";

describe("App", () => {
  it("boots and initializes the HTTP adapter", async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app: INestApplication = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    expect(app.getHttpAdapter()).toBeDefined();
    await app.close();
  });
});