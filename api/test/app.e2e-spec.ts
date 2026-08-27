import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { get as httpGet } from "node:http";
import { AppModule } from "../src/app.module";

describe("App", () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    await app.listen(0);
    const addr = app.getHttpServer().address();
    port = typeof addr === "object" && addr ? addr.port : 0;
  });

  afterAll(async () => await app.close());

  const get = (path: string) =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = httpGet(
        { host: "127.0.0.1", port, path },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }),
          );
        },
      );
      req.on("error", reject);
    });

  it("boots and serves /api/health", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});