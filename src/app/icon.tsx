/* eslint-disable @next/next/no-img-element -- ImageResponse requires a native img element. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const logo = await readFile(
    join(process.cwd(), "public", "logo", "jai-logo.png"),
    "base64",
  );

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "transparent",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          display: "flex",
          height: "56px",
          justifyContent: "center",
          width: "56px",
        }}
      >
        <img
          alt=""
          height={30}
          src={`data:image/png;base64,${logo}`}
          style={{ objectFit: "contain" }}
          width={44}
        />
      </div>
    </div>,
    size,
  );
}
