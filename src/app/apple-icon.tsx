/* eslint-disable @next/next/no-img-element -- ImageResponse requires a native img element. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const logo = await readFile(
    join(process.cwd(), "public", "logo", "jai-logo.png"),
    "base64",
  );

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#ffffff",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <img
        alt=""
        height={102}
        src={`data:image/png;base64,${logo}`}
        style={{ objectFit: "contain" }}
        width={150}
      />
    </div>,
    size,
  );
}
