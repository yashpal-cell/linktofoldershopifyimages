import { useState } from "react";
import type { DragEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderInput,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  Pencil,
  X,
} from "lucide-react";
import type { FolderNode } from "../types/asset.ts";

interface FolderTreeSidebarProps {
  rootFolderName: string;
  folders: FolderNode[];
  selectedFolder: string | null;
  onSelectFolder: (folderName: string | null) => void;
  totalFiles: number;
  disabled?: boolean;
  onRenameFolder: (oldName: string, newName: string) => void;
  onRenameFile: (assetId: string, newFileName: string) => void;
  onMoveFile: (assetId: string, targetFolder: string) => void;
}

export function FolderTreeSidebar({
  rootFolderName,
  folders,
  selectedFolder,
  onSelectFolder,
  totalFiles,
  disabled = false,
  onRenameFolder,
  onRenameFile,
  onMoveFile,
}: FolderTreeSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [treeSearch, setTreeSearch] = useState("");

  // Inline folder rename state
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState("");

  // Inline file rename state
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [fileDraft, setFileDraft] = useState("");

  // Inline move-to-folder state
  const [movingFileId, setMovingFileId] = useState<string | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState("");
  const [creatingNewFolder, setCreatingNewFolder] = useState(false);
  const [newFolderDraft, setNewFolderDraft] = useState("");

  // Drag-and-drop state
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);

  const toggleExpand = (folderName: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  const normalizedQuery = treeSearch.trim().toLowerCase();
  const filteredFolders = normalizedQuery
    ? folders.filter(
        (f) =>
          f.name.toLowerCase().includes(normalizedQuery) ||
          f.files.some((file) =>
            file.targetFileName.toLowerCase().includes(normalizedQuery)
          )
      )
    : folders;

  const startFolderRename = (folderName: string) => {
    if (disabled) return;
    setEditingFileId(null);
    setMovingFileId(null);
    setEditingFolder(folderName);
    setFolderDraft(folderName);
  };

  const commitFolderRename = () => {
    if (!editingFolder) return;
    const trimmed = folderDraft.trim();
    if (trimmed && trimmed !== editingFolder) {
      onRenameFolder(editingFolder, trimmed);
      setExpandedFolders((prev) => {
        const next = { ...prev };
        if (next[editingFolder]) {
          next[trimmed] = true;
          delete next[editingFolder];
        }
        return next;
      });
    }
    setEditingFolder(null);
    setFolderDraft("");
  };

  const startFileRename = (assetId: string, currentName: string) => {
    if (disabled) return;
    setEditingFolder(null);
    setMovingFileId(null);
    setEditingFileId(assetId);
    setFileDraft(currentName);
  };

  const commitFileRename = () => {
    if (!editingFileId) return;
    const trimmed = fileDraft.trim();
    if (trimmed) {
      onRenameFile(editingFileId, trimmed);
    }
    setEditingFileId(null);
    setFileDraft("");
  };

  const startMoveFile = (assetId: string, currentFolder: string) => {
    if (disabled) return;
    setEditingFolder(null);
    setEditingFileId(null);
    setMovingFileId(assetId);
    setCreatingNewFolder(false);
    setNewFolderDraft("");
    const alternative = folders.find((f) => f.name !== currentFolder)?.name ?? currentFolder;
    setMoveTargetFolder(alternative);
  };

  const commitMoveFile = (assetId: string, currentFolder: string) => {
    const destination = creatingNewFolder
      ? newFolderDraft.trim()
      : moveTargetFolder.trim();
    if (destination && destination !== currentFolder) {
      onMoveFile(assetId, destination);
      setExpandedFolders((prev) => ({
        ...prev,
        [destination]: true,
      }));
    }
    setMovingFileId(null);
    setCreatingNewFolder(false);
    setNewFolderDraft("");
  };

  const handleDragStart = (
    e: DragEvent<HTMLDivElement>,
    assetId: string
  ) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", assetId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedAssetId(assetId);
  };

  const handleDragEnd = () => {
    setDraggedAssetId(null);
    setDropTargetFolder(null);
  };

  const handleFolderDragOver = (
    e: DragEvent<HTMLDivElement>,
    folderName: string
  ) => {
    if (disabled || !draggedAssetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetFolder !== folderName) {
      setDropTargetFolder(folderName);
    }
  };

  const handleFolderDrop = (
    e: DragEvent<HTMLDivElement>,
    targetFolder: string
  ) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData("text/plain") || draggedAssetId;
    setDraggedAssetId(null);
    setDropTargetFolder(null);
    if (!disabled && assetId) {
      onMoveFile(assetId, targetFolder);
      setExpandedFolders((prev) => ({ ...prev, [targetFolder]: true }));
    }
  };

  return (
    <aside className="w-full lg:w-[292px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col">
      <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Folder Preview</h2>
          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
            {folders.length} styles · {totalFiles} files
          </p>
        </div>
        {selectedFolder && (
          <button
            type="button"
            onClick={() => onSelectFolder(null)}
            className="text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Show all
          </button>
        )}
      </div>

      {folders.length > 4 && (
        <div className="px-3 py-2.5 border-b border-slate-100">
          <input
            type="text"
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            placeholder="Filter folders or files..."
            aria-label="Filter style folders or files"
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2.5 py-3 max-h-[380px] lg:max-h-[calc(100vh-175px)]">
        {folders.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload an Excel or CSV sheet to preview how style folders and image filenames will be structured.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {rootFolderName.trim() && (
              <button
                type="button"
                onClick={() => onSelectFolder(null)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors cursor-pointer ${
                  selectedFolder === null
                    ? "bg-slate-100 text-slate-900 font-semibold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span className="truncate font-mono">{rootFolderName.trim()}/</span>
              </button>
            )}

            <div className={rootFolderName.trim() ? "pl-2.5 space-y-0.5" : "space-y-0.5"}>
              {filteredFolders.map((folder) => {
                const isExpanded = Boolean(expandedFolders[folder.name]);
                const isSelected = selectedFolder === folder.name;
                const isDropTarget = dropTargetFolder === folder.name;
                const isEditingThisFolder = editingFolder === folder.name;
                const savedCount = folder.files.filter((f) => f.status === "saved").length;

                return (
                  <div key={folder.name}>
                    <div
                      onDragOver={(e) => handleFolderDragOver(e, folder.name)}
                      onDragLeave={() => {
                        if (dropTargetFolder === folder.name) {
                          setDropTargetFolder(null);
                        }
                      }}
                      onDrop={(e) => handleFolderDrop(e, folder.name)}
                      className={`group flex items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors ${
                        isDropTarget
                          ? "bg-teal-50 ring-1 ring-teal-600 text-teal-950"
                          : isSelected
                            ? "bg-teal-50 text-teal-950"
                            : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpand(folder.name)}
                        aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
                        className="p-0.5 text-slate-400 hover:text-slate-700 shrink-0 cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {isEditingThisFolder ? (
                        <div className="flex-1 min-w-0 flex items-center gap-1">
                          <input
                            type="text"
                            value={folderDraft}
                            onChange={(e) => setFolderDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitFolderRename();
                              } else if (e.key === "Escape") {
                                setEditingFolder(null);
                              }
                            }}
                            autoFocus
                            aria-label={`Rename folder ${folder.name}`}
                            className="flex-1 min-w-0 px-1.5 py-0.5 text-xs font-mono bg-white border border-teal-600 rounded text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={commitFolderRename}
                            aria-label="Save folder name"
                            className="p-0.5 text-teal-700 hover:text-teal-900 shrink-0 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingFolder(null)}
                            aria-label="Cancel folder rename"
                            className="p-0.5 text-slate-400 hover:text-slate-700 shrink-0 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              onSelectFolder(isSelected ? null : folder.name)
                            }
                            className="flex-1 min-w-0 flex items-center justify-between gap-1.5 text-left cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {isSelected || isExpanded ? (
                                <FolderOpen className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                              ) : (
                                <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <span
                                className={`text-xs truncate font-mono ${
                                  isSelected ? "font-semibold" : "font-medium"
                                }`}
                                title={folder.name}
                              >
                                {folder.name}
                              </span>
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
                              {savedCount > 0 ? `${savedCount}/${folder.files.length}` : folder.files.length}
                            </span>
                          </button>

                          {!disabled && (
                            <button
                              type="button"
                              onClick={() => startFolderRename(folder.name)}
                              title={`Rename ${folder.name}`}
                              aria-label={`Rename folder ${folder.name}`}
                              className="p-0.5 text-slate-400 hover:text-slate-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="pl-5 pr-1 py-1 space-y-0.5">
                        {folder.files.slice(0, 80).map((file) => {
                          const isEditingThisFile = editingFileId === file.id;
                          const isMovingThisFile = movingFileId === file.id;

                          return (
                            <div key={file.id} className="space-y-1">
                              {isEditingThisFile ? (
                                <div className="flex items-center gap-1 py-0.5">
                                  <input
                                    type="text"
                                    value={fileDraft}
                                    onChange={(e) => setFileDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        commitFileRename();
                                      } else if (e.key === "Escape") {
                                        setEditingFileId(null);
                                      }
                                    }}
                                    autoFocus
                                    aria-label={`Rename file ${file.targetFileName}`}
                                    className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] font-mono bg-white border border-teal-600 rounded text-slate-900 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={commitFileRename}
                                    aria-label="Save file name"
                                    className="p-0.5 text-teal-700 hover:text-teal-900 shrink-0 cursor-pointer"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingFileId(null)}
                                    aria-label="Cancel file rename"
                                    className="p-0.5 text-slate-400 hover:text-slate-700 shrink-0 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div
                                  draggable={!disabled}
                                  onDragStart={(e) => handleDragStart(e, file.id)}
                                  onDragEnd={handleDragEnd}
                                  className={`group/file flex items-center justify-between gap-1 py-0.5 px-1 rounded text-[11px] text-slate-600 hover:bg-slate-50 ${
                                    draggedAssetId === file.id ? "opacity-45" : ""
                                  }`}
                                  title={`${file.targetFileName} (drag to another folder or use actions)`}
                                >
                                  <div className="flex items-center gap-1 min-w-0">
                                    {!disabled && (
                                      <GripVertical className="w-3 h-3 text-slate-300 group-hover/file:text-slate-400 shrink-0 cursor-grab" />
                                    )}
                                    <ImageIcon className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate font-mono">
                                      {file.targetFileName}
                                    </span>
                                  </div>

                                  {!disabled && (
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          startFileRename(file.id, file.targetFileName)
                                        }
                                        title="Rename image file"
                                        aria-label={`Rename ${file.targetFileName}`}
                                        className="p-0.5 text-slate-400 hover:text-slate-800 cursor-pointer"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          startMoveFile(file.id, folder.name)
                                        }
                                        title="Move image to another style folder"
                                        aria-label={`Move ${file.targetFileName} to another folder`}
                                        className="p-0.5 text-slate-400 hover:text-teal-700 cursor-pointer"
                                      >
                                        <FolderInput className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {isMovingThisFile && (
                                <div className="ml-3 p-2 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                                  <span className="block text-[10px] font-medium text-slate-500">
                                    Move to style folder:
                                  </span>
                                  {!creatingNewFolder ? (
                                    <select
                                      value={moveTargetFolder}
                                      onChange={(e) => {
                                        if (e.target.value === "__new__") {
                                          setCreatingNewFolder(true);
                                          setNewFolderDraft("");
                                        } else {
                                          setMoveTargetFolder(e.target.value);
                                        }
                                      }}
                                      aria-label="Destination style folder"
                                      className="w-full px-2 py-1 text-[11px] font-mono bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:border-teal-600"
                                    >
                                      {folders.map((target) => (
                                        <option key={target.name} value={target.name}>
                                          {target.name}
                                          {target.name === folder.name ? " (current)" : ""}
                                        </option>
                                      ))}
                                      <option value="__new__">+ New style folder...</option>
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={newFolderDraft}
                                      onChange={(e) => setNewFolderDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          commitMoveFile(file.id, folder.name);
                                        } else if (e.key === "Escape") {
                                          setMovingFileId(null);
                                        }
                                      }}
                                      placeholder="Enter new style folder..."
                                      autoFocus
                                      aria-label="New destination folder name"
                                      className="w-full px-2 py-1 text-[11px] font-mono bg-white border border-teal-600 rounded text-slate-900 focus:outline-none"
                                    />
                                  )}

                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setMovingFileId(null)}
                                      className="px-2 py-0.5 text-[11px] text-slate-600 hover:text-slate-900 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => commitMoveFile(file.id, folder.name)}
                                      className="px-2 py-0.5 text-[11px] font-medium text-white bg-teal-700 rounded hover:bg-teal-800 cursor-pointer"
                                    >
                                      Move
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {folder.files.length > 80 && (
                          <p className="text-[11px] text-slate-400 pl-4 font-mono tabular-nums">
                            +{folder.files.length - 80} more files
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredFolders.length === 0 && treeSearch.trim() && (
                <p className="text-xs text-slate-400 px-2 py-3">
                  No folders or files match "{treeSearch}".
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {folders.length > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70">
          <p className="text-[11px] text-slate-500">
            Drag files to move between styles, or hover any folder or file to rename.
          </p>
        </div>
      )}
    </aside>
  );
}
