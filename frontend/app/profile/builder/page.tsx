"use client";

import { useState, useEffect } from "react";

interface Experience {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  description: string;
}

interface Education {
  id: string;
  degree: string;
  institution: string;
  year: string;
}

interface Skill {
  name: string;
  level: "Beginner" | "Intermediate" | "Expert";
}

interface ResumeData {
  name: string;
  tagline: string;
  location: string;
  languages: string;
  bio: string;
  experiences: Experience[];
  education: Education[];
  skills: Skill[];
  github: string;
  linkedin: string;
  website: string;
}

const STORAGE_KEY = "stellarwork:resume-builder";

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function loadResume(): ResumeData {
  if (typeof window === "undefined") return defaultResume();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ResumeData) : defaultResume();
  } catch {
    return defaultResume();
  }
}

function defaultResume(): ResumeData {
  return {
    name: "",
    tagline: "",
    location: "",
    languages: "",
    bio: "",
    experiences: [],
    education: [],
    skills: [],
    github: "",
    linkedin: "",
    website: "",
  };
}

function calculateCompletion(data: ResumeData): number {
  let total = 0;
  let filled = 0;
  const fields: (keyof ResumeData)[] = ["name", "tagline", "location", "bio"];
  for (const f of fields) {
    total++;
    if (data[f as keyof ResumeData]) filled++;
  }
  total++;
  if (data.experiences.length > 0) filled++;
  total++;
  if (data.education.length > 0) filled++;
  total++;
  if (data.skills.length > 0) filled++;
  total++;
  if (data.github || data.linkedin || data.website) filled++;
  return Math.round((filled / total) * 100);
}

export default function ProfileBuilderPage() {
  const [resume, setResume] = useState<ResumeData>(defaultResume);
  const [preview, setPreview] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setResume(loadResume());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
      } catch { /* ignore */ }
    }
  }, [resume, loaded]);

  const completion = calculateCompletion(resume);

  function updateField<K extends keyof ResumeData>(key: K, value: ResumeData[K]) {
    setResume((prev) => ({ ...prev, [key]: value }));
  }

  function addExperience() {
    setResume((prev) => ({
      ...prev,
      experiences: [
        ...prev.experiences,
        { id: generateId(), title: "", company: "", startDate: "", endDate: "", description: "" },
      ],
    }));
  }

  function updateExperience(id: string, field: keyof Experience, value: string) {
    setResume((prev) => ({
      ...prev,
      experiences: prev.experiences.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  }

  function removeExperience(id: string) {
    setResume((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((e) => e.id !== id),
    }));
  }

  function addEducation() {
    setResume((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        { id: generateId(), degree: "", institution: "", year: "" },
      ],
    }));
  }

  function updateEducation(id: string, field: keyof Education, value: string) {
    setResume((prev) => ({
      ...prev,
      education: prev.education.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  }

  function removeEducation(id: string) {
    setResume((prev) => ({
      ...prev,
      education: prev.education.filter((e) => e.id !== id),
    }));
  }

  function addSkill() {
    setResume((prev) => ({
      ...prev,
      skills: [...prev.skills, { name: "", level: "Intermediate" as const }],
    }));
  }

  function updateSkill(index: number, field: keyof Skill, value: string) {
    setResume((prev) => ({
      ...prev,
      skills: prev.skills.map((s, i) =>
        i === index ? { ...s, [field]: field === "level" ? (value as Skill["level"]) : value } : s
      ),
    }));
  }

  function removeSkill(index: number) {
    setResume((prev) => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index),
    }));
  }

  if (preview) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile Preview</h1>
            <button
              type="button"
              onClick={() => setPreview(false)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Edit
            </button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8">
            {resume.name && <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{resume.name}</p>}
            {resume.tagline && <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">{resume.tagline}</p>}
            {resume.location && <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">{resume.location}</p>}
            {resume.bio && <p className="text-gray-700 dark:text-gray-300 mb-6">{resume.bio}</p>}

            {resume.experiences.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Experience</h2>
                {resume.experiences.map((exp) => (
                  <div key={exp.id} className="mb-4">
                    <h3 className="font-medium text-gray-900 dark:text-white">{exp.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{exp.company} | {exp.startDate} - {exp.endDate || "Present"}</p>
                    {exp.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{exp.description}</p>}
                  </div>
                ))}
              </div>
            )}

            {resume.education.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Education</h2>
                {resume.education.map((edu) => (
                  <div key={edu.id} className="mb-2">
                    <p className="font-medium text-gray-900 dark:text-white">{edu.degree}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{edu.institution} ({edu.year})</p>
                  </div>
                ))}
              </div>
            )}

            {resume.skills.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {resume.skills.map((skill, i) => (
                    <span key={i} className="px-3 py-1 text-sm rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {skill.name} ({skill.level})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(resume.github || resume.linkedin || resume.website) && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Links</h2>
                <div className="space-y-1 text-sm">
                  {resume.github && <p>GitHub: {resume.github}</p>}
                  {resume.linkedin && <p>LinkedIn: {resume.linkedin}</p>}
                  {resume.website && <p>Website: {resume.website}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Resume Builder</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Create a professional profile to showcase your skills</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Profile {completion}% complete
            </div>
            <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${completion}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Personal Info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <input type="text" value={resume.name} onChange={(e) => updateField("name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Jane Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tagline</label>
              <input type="text" value={resume.tagline} onChange={(e) => updateField("tagline", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Full-stack developer & blockchain engineer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
              <input type="text" value={resume.location} onChange={(e) => updateField("location", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="San Francisco, CA" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Languages</label>
              <input type="text" value={resume.languages} onChange={(e) => updateField("languages", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="English, Spanish" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
            <textarea value={resume.bio} onChange={(e) => updateField("bio", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              rows={3} placeholder="Tell clients about yourself..." />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Work Experience</h2>
            <button type="button" onClick={addExperience}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              + Add
            </button>
          </div>
          {resume.experiences.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No experience added yet.</p>}
          {resume.experiences.map((exp) => (
            <div key={exp.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={exp.title} onChange={(e) => updateExperience(exp.id, "title", e.target.value)}
                  placeholder="Job Title" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                <input type="text" value={exp.company} onChange={(e) => updateExperience(exp.id, "company", e.target.value)}
                  placeholder="Company" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                <input type="text" value={exp.startDate} onChange={(e) => updateExperience(exp.id, "startDate", e.target.value)}
                  placeholder="Start Date" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                <div className="flex gap-2">
                  <input type="text" value={exp.endDate} onChange={(e) => updateExperience(exp.id, "endDate", e.target.value)}
                    placeholder="End Date (or leave blank)" className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  <button type="button" onClick={() => removeExperience(exp.id)}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    Remove
                  </button>
                </div>
              </div>
              <textarea value={exp.description} onChange={(e) => updateExperience(exp.id, "description", e.target.value)}
                placeholder="Describe your responsibilities and achievements..."
                className="w-full mt-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows={2} />
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Education</h2>
            <button type="button" onClick={addEducation}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              + Add
            </button>
          </div>
          {resume.education.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No education added yet.</p>}
          {resume.education.map((edu) => (
            <div key={edu.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input type="text" value={edu.degree} onChange={(e) => updateEducation(edu.id, "degree", e.target.value)}
                  placeholder="Degree / Certification" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                <input type="text" value={edu.institution} onChange={(e) => updateEducation(edu.id, "institution", e.target.value)}
                  placeholder="Institution" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                <div className="flex gap-2">
                  <input type="text" value={edu.year} onChange={(e) => updateEducation(edu.id, "year", e.target.value)}
                    placeholder="Year" className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  <button type="button" onClick={() => removeEducation(edu.id)}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Skills</h2>
            <button type="button" onClick={addSkill}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              + Add
            </button>
          </div>
          {resume.skills.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No skills added yet.</p>}
          {resume.skills.map((skill, i) => (
            <div key={i} className="flex items-center gap-3 mb-2">
              <input type="text" value={skill.name} onChange={(e) => updateSkill(i, "name", e.target.value)}
                placeholder="Skill name"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              <select value={skill.level} onChange={(e) => updateSkill(i, "level", e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Expert">Expert</option>
              </select>
              <button type="button" onClick={() => removeSkill(i)}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">External Links</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GitHub</label>
              <input type="url" value={resume.github} onChange={(e) => updateField("github", e.target.value)}
                placeholder="https://github.com/yourhandle"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">LinkedIn</label>
              <input type="url" value={resume.linkedin} onChange={(e) => updateField("linkedin", e.target.value)}
                placeholder="https://linkedin.com/in/yourprofile"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Personal Website</label>
              <input type="url" value={resume.website} onChange={(e) => updateField("website", e.target.value)}
                placeholder="https://yourwebsite.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setPreview(true)}
            className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            Preview
          </button>
        </div>
      </div>
    </div>
  );
}
