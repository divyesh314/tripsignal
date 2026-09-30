"use client";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button type="button" className="icon-btn-dark" aria-label="Sign out" title="Sign out"
      onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/signin"); router.refresh(); }}>
      <Icon name="user" />
    </button>
  );
}
