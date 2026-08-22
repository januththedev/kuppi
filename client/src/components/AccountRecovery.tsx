import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function AccountRecovery({ onClose }: { onClose: () => void }) {
  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const recoveryMutation = trpc.account.recoverPassword.useMutation({ onSuccess: () => { toast.success("Your Kuppi password has been reset. You can sign in now."); onClose(); }, onError: (error) => toast.error(error.message) });
  function submitRecovery(event: FormEvent) { event.preventDefault(); recoveryMutation.mutate({ fullName, contactNumber, username, password, confirmPassword }); }
  return <div className="account-modal recovery-modal"><span className="modal-mark"><span className="brand-orb"><span /></span></span><form className="account-form" onSubmit={submitRecovery}><h2>Reset your password.</h2><p>For account recovery, match the full name, private contact number, and username used when you created your Kuppi account.</p><label><span>Full name</span><input value={fullName} autoComplete="name" onChange={(event) => setFullName(event.target.value)} required /></label><label><span>Contact number</span><input type="tel" value={contactNumber} autoComplete="tel" onChange={(event) => setContactNumber(event.target.value)} required /></label><label><span>Username</span><input value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} required /></label><label><span>New password</span><input type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label><label><span>Re-enter new password</span><input type="password" value={confirmPassword} autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label><Button type="submit" disabled={recoveryMutation.isPending} className="w-full rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">{recoveryMutation.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck size={16} />} Reset password</Button></form></div>;
}
