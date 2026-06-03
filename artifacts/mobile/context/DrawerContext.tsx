import React, { createContext, useContext, useRef, useState } from "react";
import { Animated } from "react-native";

export const DRAWER_WIDTH = 280;

interface DrawerContextValue {
  isOpen: boolean;
  anim: Animated.Value;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextValue>({
  isOpen: false,
  anim: new Animated.Value(0),
  openDrawer: () => {},
  closeDrawer: () => {},
});

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const openDrawer = () => {
    setIsOpen(true);
    Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  };

  const closeDrawer = () => {
    Animated.timing(anim, { toValue: 0, duration: 240, useNativeDriver: true }).start(() =>
      setIsOpen(false),
    );
  };

  return (
    <DrawerContext.Provider value={{ isOpen, anim, openDrawer, closeDrawer }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer() {
  return useContext(DrawerContext);
}
