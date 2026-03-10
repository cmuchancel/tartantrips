"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import AppNav from "../components/AppNav";

type ProfileFormState = {
  name: string;
  major: string;
  graduationYear: string;
  sex: string;
  phone: string;
  avatarPath: string;
};

const SEX_OPTIONS = ["Male", "Female", "Non-binary"] as const;

const initialProfileState: ProfileFormState = {
  name: "",
  major: "",
  graduationYear: "",
  sex: "",
  phone: "",
  avatarPath: ""
};

const PROFILE_REASONS = [
  {
    title: "Safer first meetings",
    description: "A real name, photo, and phone number make it much easier to trust who you are coordinating with before pickup."
  },
  {
    title: "Better match quality",
    description: "Your major, year, and identity preferences give the matching algorithm more context to recommend stronger ride partners."
  },
  {
    title: "Verified identity",
    description: "Your locked CMU email stays attached to the profile so every ride request starts from a confirmed campus identity."
  }
];

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<ProfileFormState>(initialProfileState);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const { data, error: userError } = await supabase.auth.getUser();

      if (userError || !data?.user) {
        router.replace("/login");
        return;
      }

      setUserId(data.user.id);
      setEmail(data.user.email ?? "");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("name,major,graduation_year,sex,phone,avatar_path")
        .eq("user_id", data.user.id)
        .single();

      setForm({
        name: profileData?.name ?? "",
        major: profileData?.major ?? "",
        graduationYear: profileData?.graduation_year ?? "",
        sex: profileData?.sex ?? "",
        phone: profileData?.phone ?? "",
        avatarPath: profileData?.avatar_path ?? ""
      });
      setLoading(false);
    };

    loadUser();
  }, [router]);

  const updateForm = (key: keyof ProfileFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name || !form.major || !form.graduationYear || !form.sex || !form.phone) {
      setError("Please complete all required profile fields.");
      return;
    }

    setSaving(true);
    if (!userId) {
      setError("We couldn't confirm your session. Please log in again.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        email,
        name: form.name,
        major: form.major,
        graduation_year: form.graduationYear,
        sex: form.sex,
        phone: form.phone,
        avatar_path: form.avatarPath || null
      },
      { onConflict: "user_id" }
    );

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSuccess("Profile updated.");
    setSaving(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const uploadAvatar = async (file: File) => {
    if (!userId) {
      setError("We couldn't confirm your session. Please log in again.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      setError("Please upload a PNG or JPEG image.");
      return;
    }

    setError("");
    setSuccess("");
    setUploading(true);

    const extension = file.name.split(".").pop() || "jpg";
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    setForm((prev) => ({ ...prev, avatarPath: filePath }));
    setUploading(false);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    uploadAvatar(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      uploadAvatar(file);
    }
  };

  const profileInitial = form.name.trim().charAt(0).toUpperCase() || "TT";

  return (
    <main className="page-shell">
      <div className="page-content space-y-6">
        <AppNav />

        <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
          <aside className="space-y-6">
            <section className="glass-panel rounded-[2.25rem] p-8 md:p-10">
              <span className="section-chip">Profile-powered matching</span>
              <h1 className="mt-5 text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
                Build the rider profile your future match can trust.
              </h1>
              <p className="mt-5 text-lg leading-8 text-slate-700">
                Your verified email handles the security side. This profile handles the comfort and
                matching side, helping our algorithm find a better partner and helping another
                student feel more at ease before you meet.
              </p>
              {loading ? (
                <p className="mt-6 text-sm text-slate-600">Loading your profile...</p>
              ) : (
                <div className="mt-6 rounded-[1.7rem] border border-white/70 bg-white/65 px-5 py-4">
                  <p className="text-sm text-slate-600">Verified email</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{email}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    This stays locked because it is part of the trust signal every rider sees.
                  </p>
                </div>
              )}
            </section>

            <section className="glass-panel rounded-[2rem] p-6 md:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Why this matters
              </p>
              <div className="mt-5 space-y-4">
                {PROFILE_REASONS.map((reason) => (
                  <div key={reason.title} className="soft-card">
                    <p className="text-sm font-semibold text-slate-900">{reason.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{reason.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="glass-panel rounded-[2.25rem] p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Your rider card
              </p>
              <h2 className="text-3xl font-semibold text-slate-900">Complete your profile</h2>
              <p className="text-sm leading-6 text-slate-600">
                Add the details that power better ride matches and help both students feel
                comfortable before coordinating a pickup.
              </p>
            </div>

            {loading ? null : (
              <form className="mt-8 space-y-6" onSubmit={handleSave}>
                <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-white/80 bg-gradient-to-br from-[#f0d2bf] to-white text-3xl font-semibold text-slate-900 shadow-lg shadow-slate-900/10">
                      {form.avatarPath ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={supabase.storage.from("avatars").getPublicUrl(form.avatarPath).data.publicUrl}
                            alt="Profile"
                            className="h-full w-full object-cover"
                          />
                        </>
                      ) : (
                        <span>{profileInitial}</span>
                      )}
                    </div>
                    <div
                      className={`w-full rounded-[1.4rem] border border-dashed px-4 py-4 text-center text-xs leading-5 text-slate-500 ${
                        dragActive
                          ? "border-slate-900 bg-white/80"
                          : "border-slate-300 bg-white/55"
                      }`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                    >
                      {uploading ? "Uploading your photo..." : "Drag and drop a photo to help riders recognize you."}
                    </div>
                    <label className="w-full">
                      <span className="sr-only">Upload profile picture</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <span className="secondary-cta w-full cursor-pointer">
                        Choose a photo
                      </span>
                    </label>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                        Verified email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={email}
                        disabled
                        className="mt-1 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-3 text-slate-600"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
                        Phone number
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(event) => updateForm("phone", event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60"
                        placeholder="(555) 555-5555"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                        Full name
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        value={form.name}
                        onChange={(event) => updateForm("name", event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60"
                        required
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-700" htmlFor="sex">
                          Sex / Gender
                        </label>
                        <select
                          id="sex"
                          name="sex"
                          value={form.sex}
                          onChange={(event) => updateForm("sex", event.target.value)}
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60"
                          required
                        >
                          <option value="">Select one</option>
                          {SEX_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          className="block text-sm font-medium text-slate-700"
                          htmlFor="graduationYear"
                        >
                          Graduation year
                        </label>
                        <input
                          id="graduationYear"
                          name="graduationYear"
                          type="text"
                          value={form.graduationYear}
                          onChange={(event) => updateForm("graduationYear", event.target.value)}
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700" htmlFor="major">
                        Major
                      </label>
                      <input
                        id="major"
                        name="major"
                        type="text"
                        value={form.major}
                        onChange={(event) => updateForm("major", event.target.value)}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60"
                        required
                      />
                    </div>
                  </div>
                </div>

                {error ? (
                  <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                    {error}
                  </p>
                ) : null}
                {success ? (
                  <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                    {success}
                  </p>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    className="primary-cta w-full disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save my rider profile"}
                  </button>
                  <button
                    type="button"
                    className="secondary-cta w-full"
                    onClick={handleSignOut}
                  >
                    Sign out
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
