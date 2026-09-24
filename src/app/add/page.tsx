import { redirect } from "next/navigation";

export const metadata = { title: "Dhawq" };

/**
 * The bulk "Add fast" experiment is no longer part of the product.
 * Keep the old URL harmless for saved links instead of leaving a dead route.
 */
export default function AddPage() {
  redirect("/");
}
