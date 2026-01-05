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

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <AppNav />
          <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
          {loading ? (
            <p className="text-sm text-slate-600">Loading your profile...</p>
          ) : (
            <p className="text-sm text-slate-700">
              Signed in as <span className="font-medium">{email}</span>
            </p>
          )}
        </div>

        {loading ? null : (
          <form className="mt-6 space-y-6" onSubmit={handleSave}>
            <div className="grid gap-6 md:grid-cols-[200px_1fr]">
              <div className="flex flex-col items-center gap-3">
                <div className="h-28 w-28 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  {form.avatarPath ? (
                    <img
                      src={supabase.storage.from("avatars").getPublicUrl(form.avatarPath).data.publicUrl}
                      alt="Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div
                  className={`w-full rounded-lg border border-dashed px-3 py-3 text-center text-xs text-slate-500 ${
                    dragActive ? "border-slate-900 bg-slate-50" : "border-slate-300"
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                >
                  {uploading ? "Uploading..." : "Drag and drop a photo"}
                </div>
                <label className="w-full">
                  <span className="sr-only">Upload profile picture</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="block w-full rounded-md border border-slate-300 px-3 py-2 text-center text-xs font-medium text-slate-900 hover:bg-slate-50">
                    Choose a file
                  </span>
                </label>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    disabled
                    className="mt-1 w-full cursor-not-allowed rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700"
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
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    placeholder="(555) 555-5555"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                    Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
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
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
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
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
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
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    required
                  />
                </div>
              </div>
            </div>

            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-sm text-green-600" role="status">
                {success}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
