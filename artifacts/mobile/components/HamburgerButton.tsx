import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

export default function HamburgerButton() {
  const { openDrawer } = useDrawer();
  const colors = useColors();

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); openDrawer(); }}
      style={styles.btn}
      hitSlop={12}
    >
      <Feather name="menu" size={22} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 4 },
});
