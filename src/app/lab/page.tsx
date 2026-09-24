import LabScreen from "./LabScreen";

/**
 * Production test bench.
 *
 * The screen is deliberately unlinked, but it is useful on the real deployed
 * build because that is where phone/network/render behaviour can be judged.
 * Cloud-account safety is enforced inside LabScreen: destructive test tools
 * are available only while signed out, so a test reset cannot erase or mutate
 * a synced account.
 */
export const metadata = { title: "Lab" };

export default function LabPage() {
  return <LabScreen />;
}
