import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

function readPort(value: string | undefined): number {
  if (value === undefined) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("API_PORT must be an integer from 1 to 65535");
  }
  return port;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: false, limit: "64kb" }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header("x-request-id")?.slice(0, 128) || randomUUID();
    response.setHeader("x-request-id", requestId);
    next();
  });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  await app.listen(readPort(process.env.API_PORT), "0.0.0.0");
}

void bootstrap();
