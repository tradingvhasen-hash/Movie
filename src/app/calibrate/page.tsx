import { notFound } from "next/navigation";
import CalibrationGrid from "@/components/CalibrationGrid";

export const metadata = { title: "Calibration" };

/**
 * Internal research instrument, not a product route. The public app uses no
 * sentinel/calibration answers for taste or exposure training.
 */
export default function CalibratePage() {
  if (process.env.ENABLE_CALIBRATION !== "1") notFound();
  return <CalibrationGrid />;
}
