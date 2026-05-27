import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Game } from "../lib/types";
import type { LibrarySortOption } from "../pages/LibraryPage";

export interface AdvancedFilters {
  status: string[];
  productCategories: string[];
  categories: string[];
  sizeQuery: string;
  players: string[];
  features: string[];
  hardware: string[];
  genres: string[];
  platforms: string[];
}

export interface DynamicCollection {
  name: string;
  filters: AdvancedFilters;
  platformFilter: "all" | "windows" | "macos" | "linux";
  searchQuery: string;
}

const initialAdvancedFilters: AdvancedFilters = {
  status: [],
  productCategories: ["game", "software"],
  categories: [],
  sizeQuery: "",
  players: [],
  features: [],
  hardware: [],
  genres: [],
  platforms: [],
};

export interface LibraryState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  
  sortOption: LibrarySortOption;
  setSortOption: (option: LibrarySortOption) => void;
  
  isFilterPopupOpen: boolean;
  setIsFilterPopupOpen: (isOpen: boolean) => void;
  
  activePlatformFilter: "all" | "windows" | "macos" | "linux";
  setActivePlatformFilter: (platform: "all" | "windows" | "macos" | "linux") => void;
  
  advancedFilters: AdvancedFilters;
  setAdvancedFilters: (filters: Partial<AdvancedFilters> | ((prev: AdvancedFilters) => AdvancedFilters)) => void;
  
  customCategories: Record<string, string[]>;
  setCustomCategories: (categories: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>)) => void;
  
  newCollectionName: string;
  setNewCollectionName: (name: string) => void;
  
  groupOption: string;
  setGroupOption: (group: string) => void;
  
  activeTab: "overview" | "achievements";
  setActiveTab: (tab: "overview" | "achievements") => void;

  hiddenGames: Record<string, boolean>;
  setHiddenGames: (hidden: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  
  favorites: Record<string, boolean>;
  setFavorites: (favorites: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;

  dynamicCollections: DynamicCollection[];
  setDynamicCollections: (collections: DynamicCollection[] | ((prev: DynamicCollection[]) => DynamicCollection[])) => void;

  manualCollections: Record<string, string[]>;
  setManualCollections: (collections: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>)) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      searchQuery: "",
      setSearchQuery: (query) => set({ searchQuery: query }),
      
      sortOption: "last_played",
      setSortOption: (option) => set({ sortOption: option }),
      
      isFilterPopupOpen: false,
      setIsFilterPopupOpen: (isOpen) => set({ isFilterPopupOpen: isOpen }),
      
      activePlatformFilter: "all",
      setActivePlatformFilter: (platform) => set({ activePlatformFilter: platform }),
      
      advancedFilters: initialAdvancedFilters,
      setAdvancedFilters: (filters) => set((state) => ({
        advancedFilters: typeof filters === "function" ? filters(state.advancedFilters) : { ...state.advancedFilters, ...filters }
      })),
      
      customCategories: {},
      setCustomCategories: (categories) => set((state) => ({
        customCategories: typeof categories === "function" ? categories(state.customCategories) : categories
      })),
      
      newCollectionName: "",
      setNewCollectionName: (name) => set({ newCollectionName: name }),
      
      groupOption: "none",
      setGroupOption: (group) => set({ groupOption: group }),
      
      activeTab: "overview",
      setActiveTab: (tab) => set({ activeTab: tab }),

      hiddenGames: {},
      setHiddenGames: (hidden) => set((state) => ({
        hiddenGames: typeof hidden === "function" ? hidden(state.hiddenGames) : hidden
      })),
      
      favorites: {},
      setFavorites: (favorites) => set((state) => ({
        favorites: typeof favorites === "function" ? favorites(state.favorites) : favorites
      })),

      dynamicCollections: [],
      setDynamicCollections: (collections) => set((state) => ({
        dynamicCollections: typeof collections === "function" ? collections(state.dynamicCollections) : collections
      })),

      manualCollections: {},
      setManualCollections: (collections) => set((state) => ({
        manualCollections: typeof collections === "function" ? collections(state.manualCollections) : collections
      })),
    }),
    {
      name: "library-store",
      partialize: (state) => ({
        sortOption: state.sortOption,
        activePlatformFilter: state.activePlatformFilter,
        advancedFilters: state.advancedFilters,
        customCategories: state.customCategories,
        groupOption: state.groupOption,
        hiddenGames: state.hiddenGames,
        favorites: state.favorites,
        dynamicCollections: state.dynamicCollections,
        manualCollections: state.manualCollections,
      }),
    }
  )
);
