import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Checker } from "@/components/checker";

export default async function CheckPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <Checker
      userName={session.user.name}
      userEmail={session.user.email}
    />
  );
}
