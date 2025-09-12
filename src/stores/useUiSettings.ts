@@ .. @@
 import { create } from 'zustand';

-type ColorMode = 'size' | 'zoning';
+type ColorMode = 'none' | 'zoning';

 interface UISettings {
   colorMode: ColorMode;
@@ .. @@
 }

 export const useUiSettings = create<UISettings>((set) => ({
-  colorMode: 'size',
-  setColorMode: (colorMode) => set({ colorMode }),
+  colorMode: 'none',
+  setColorMode: (colorMode) => set({ colorMode }),
 }));