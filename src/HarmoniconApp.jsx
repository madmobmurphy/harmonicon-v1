import React, { useState, useRef, useEffect } from "react";
import {
  Pencil,
  Trash2,
  Music,
  Repeat,
  Play,
  Pause,
  XCircle,
} from "lucide-react";
import { Buffer } from "buffer";

// Optional helper: convert a local file path into a file:// URL.
const toFileURL = (p) => {
  if (!p) return null;
  if (/^(https?:|file:)/i.test(p) || p.startsWith("./") || p.startsWith("../"))
    return p;
  let fixed = p.replace(/\\/g, "/");
  if (!fixed.startsWith("/")) fixed = "/" + fixed;
  return "file://" + fixed;
};

export default function HarmoniconApp() {
  const [library, setLibrary] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [selectedUploadCat, setSelectedUploadCat] = useState("");
  const [newUploadCat, setNewUploadCat] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadError, setUploadError] = useState("");

  const [tracks, setTracks] = useState(
    Array(6)
    .fill(null)
    .map((_, i) => ({ id: i + 1, label: `Track ${i + 1}`, src: null }))
  );
  const [sfxFiles, setSfxFiles] = useState(Array(20).fill(null));
  const [sfxLabels, setSfxLabels] = useState(
    Array(20)
    .fill(null)
    .map((_, i) => `SFX ${i + 1}`)
  );
  const [sfxLoops, setSfxLoops] = useState(Array(20).fill(false));
  const [sfxPlaying, setSfxPlaying] = useState(Array(20).fill(false));
  const sfxAudioRefs = useRef([]);

  const [masterVolume, setMasterVolume] = useState(1);
  const [fxVolume, setFxVolume] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRefs = useRef([]);

  const [renamingIndex, setRenamingIndex] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [sfxRenamingIndex, setSfxRenamingIndex] = useState(null);
  const [sfxRenameValue, setSfxRenameValue] = useState("");

  const [libraryTarget, setLibraryTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [savedSets, setSavedSets] = useState([]);
  const [newSetName, setNewSetName] = useState("");
  const [selectedSetIndex, setSelectedSetIndex] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const lib = await window.electron?.getLibrary?.();
        if (Array.isArray(lib)) setLibrary(lib);
      } catch (e) {
        console.error("getLibrary failed", e);
      }
    })();
  }, []);

  useEffect(() => {
    const data = localStorage.getItem("harmonicon_savedSets");
    if (data) {
      try {
        setSavedSets(JSON.parse(data));
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("harmonicon_savedSets", JSON.stringify(savedSets));
  }, [savedSets]);

  useEffect(() => {
    audioRefs.current.forEach((a, idx) => {
      if (a && tracks[idx]?.src) a.volume = masterVolume;
    });
  }, [tracks, masterVolume]);

  useEffect(() => {
    const id = setInterval(() => {
      setIsPlaying(
        audioRefs.current.some(
          (a) => a && !a.paused && !a.ended && a.currentTime > 0
        )
      );
    }, 500);
    return () => clearInterval(id);
  }, []);

  const toggleMasterPlay = () => {
    const playing = !isPlaying;
    setIsPlaying(playing);
    audioRefs.current.forEach((a) => a && (playing ? a.play() : a.pause()));
    if (window.electron?.updatePresence) {
      window.electron.updatePresence({
        details: playing ? "Playing tracks" : "Paused",
        state: playing ? `Master Volume ${Math.round(masterVolume * 100)}%` : undefined,
                                     startTimestamp: playing ? Date.now() : undefined,
                                     largeImageKey: "harmonicon_icon",
      });
    }
  };

  const resetMusic = () => {
    audioRefs.current.forEach((a) => {
      if (!a) return;
      a.pause();
      a.removeAttribute("src");
      a.load();
    });
    setTracks(
      Array(6)
      .fill(null)
      .map((_, i) => ({ id: i + 1, label: `Track ${i + 1}`, src: null }))
    );
    setIsPlaying(false);
  };

  const handleRename = (i) => {
    setRenameValue(tracks[i].label);
    setRenamingIndex(i);
  };

  const applyRename = (i) => {
    setTracks((t) =>
    t.map((tr, idx) => (idx === i ? { ...tr, label: renameValue } : tr))
    );
    setRenamingIndex(null);
  };

  const toggleSfx = (idx) => {
    if (sfxPlaying[idx]) {
      const a = sfxAudioRefs.current[idx];
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      setSfxPlaying((l) => {
        const u = [...l];
        u[idx] = false;
        return u;
      });
    } else {
      const src = sfxFiles[idx];
      if (!src) return;
      const a = new Audio(src);
      a.volume = fxVolume;
      a.loop = sfxLoops[idx];
      const p = a.play();
      if (p?.catch) p.catch(console.error);
      sfxAudioRefs.current[idx] = a;
      setSfxPlaying((l) => {
        const u = [...l];
        u[idx] = true;
        return u;
      });
      a.onended = () => {
        setSfxPlaying((l) => {
          const u = [...l];
          u[idx] = false;
          return u;
        });
      };
    }
  };

  const resetFX = () => {
    setSfxFiles(Array(20).fill(null));
    setSfxLabels(
      Array(20)
      .fill(null)
      .map((_, i) => `SFX ${i + 1}`)
    );
  };

  const applySfxRename = (idx) => {
    setSfxLabels((labels) =>
    labels.map((l, i) => (i === idx ? sfxRenameValue : l))
    );
    setSfxRenamingIndex(null);
  };

  const deleteCustomFile = async (catName, fileObj) => {
    if (!window.confirm(`Delete file '${fileObj.label}' from '${catName}'?`))
      return;
      if (!fileObj.path) return;
      try {
        await window.electron.deleteFile(fileObj.path);
        setLibrary((lib) =>
        lib
        .map((c) =>
        c.category === catName
        ? { ...c, files: c.files.filter((f) => f !== fileObj) }
        : c
        )
        .filter((c) => c.files.length > 0)
        );
      } catch (e) {
        console.error("deleteFile failed", e);
      }
  };

  const deleteCustomCategory = async (catName) => {
    try {
      await window.electron.deleteCategory(catName);
      setLibrary((lib) => lib.filter((c) => c.category !== catName));
    } catch (e) {
      console.error("deleteCategory failed", e);
    }
  };

  const assignFromLibrary = (path) => {
    if (!libraryTarget) return;
    if (libraryTarget.type === "track") {
      setTracks((t) => {
        const u = [...t];
        u[libraryTarget.index].src = path;
        return u;
      });
    } else {
      setSfxFiles((s) => {
        const u = [...s];
        u[libraryTarget.index] = path;
        return u;
      });
    }
    setLibraryTarget(null);
  };

  const saveCurrentSet = () => {
    if (!newSetName.trim()) return;
    const config = { tracks, sfxFiles, sfxLabels, masterVolume, fxVolume };
    setSavedSets((s) => [...s, { name: newSetName.trim(), config }]);
    setNewSetName("");
  };

  const loadSelectedSet = () => {
    if (selectedSetIndex == null) return;
    const { config } = savedSets[selectedSetIndex];
    setTracks(config.tracks);
    setSfxFiles(config.sfxFiles);
    setSfxLabels(config.sfxLabels);
    setMasterVolume(config.masterVolume);
    setFxVolume(config.fxVolume);
    setLibraryTarget(null);
  };

  const deleteSelectedSet = () => {
    if (selectedSetIndex == null) return;
    setSavedSets((s) => s.filter((_, i) => i !== selectedSetIndex));
    setSelectedSetIndex(null);
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadError("Please choose an audio file");
      return;
    }
    const catName = newUploadCat || selectedUploadCat;
    if (!catName) {
      setUploadError("Select or enter a category");
      return;
    }
    const label = uploadName || uploadFile.name;
    try {
      let srcArg;
      if (uploadFile.path) {
        srcArg = uploadFile.path;
      } else {
        const arrayBuffer = await uploadFile.arrayBuffer();
        srcArg = Buffer.from(arrayBuffer);
      }
      const filePath = await window.electron.saveAudio(srcArg, catName, label);
      setLibrary((lib) => {
        const idx = lib.findIndex((c) => c.category === catName);
        if (idx >= 0) {
          return lib.map((c, i) =>
          i === idx
          ? { ...c, files: [...c.files, { label, path: filePath }] }
          : c
          );
        }
        return [...lib, { category: catName, files: [{ label, path: filePath }] }];
      });
      setUploadFile(null);
      setSelectedUploadCat("");
      setNewUploadCat("");
      setUploadName("");
      setUploadError("");
    } catch (err) {
      setUploadError("Failed to save file: " + err.message);
    }
  };

  // the return JSX remains the same as previously shown…

  // (You can paste the entire render section from the earlier example here.)

  return null; // remove this line and paste the full JSX render code.
}
