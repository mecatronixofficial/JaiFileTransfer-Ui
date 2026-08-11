/* eslint-disable @next/next/no-img-element -- ImageResponse requires a native img element. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Jai Export Enterprises secure file transfer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public", "logo", "jai-logo.png"),
    "base64",
  );

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f8faf7",
        color: "#17210d",
        display: "flex",
        fontFamily: "Arial, sans-serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 84px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#ffae00",
          display: "flex",
          height: "18px",
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />

      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexDirection: "column",
          maxWidth: "720px",
        }}
      >
        <div
          style={{
            color: "#498c01",
            display: "flex",
            fontSize: "22px",
            fontWeight: 700,
            letterSpacing: "4px",
            marginBottom: "24px",
            textTransform: "uppercase",
          }}
        >
          Secure file transfer
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "64px",
            fontWeight: 800,
            letterSpacing: "-2px",
            lineHeight: 1.05,
          }}
        >
          Jai Export Enterprises
        </div>
        <div
          style={{
            color: "#55634b",
            display: "flex",
            fontSize: "28px",
            lineHeight: 1.4,
            marginTop: "28px",
          }}
        >
          Fast, protected file sharing and reliable cloud storage for your
          business.
        </div>
      </div>

      <div
        style={{
          alignItems: "center",
          background: "#ffffff",
          border: "3px solid #e6eddf",
          borderRadius: "42px",
          display: "flex",
          height: "270px",
          justifyContent: "center",
          width: "310px",
        }}
      >
        <img
          alt=""
          height={151}
          src={`data:image/png;base64,${logo}`}
          style={{ objectFit: "contain" }}
          width={222}
        />
      </div>
    </div>,
    size,
  );
}
