import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const TABS = [
  { name: "index",    label: "Home",    icon: "home"        as const },
  { name: "analysis", label: "Analysis",icon: "bar-chart-2" as const },
  { name: "triggers", label: "Triggers",icon: "zap"         as const },
  { name: "plan",     label: "Plan",    icon: "clipboard"   as const },
  { name: "funding",  label: "Funding", icon: "trending-up" as const },
  { name: "alerts",    label: "Alerts",    icon: "bell"        as const },
  { name: "history",  label: "History",  icon: "clock"       as const },
  { name: "liquidity",label: "Liquidity",icon: "layers"      as const },
];

interface Route { name: string; key: string }
interface TabBarProps {
  state: { index: number; routes: Route[] };
  navigation: {
    navigate: (name: string) => void;
    emit: (e: { type: string; target?: string; canPreventDefault?: boolean }) => { defaultPrevented: boolean };
  };
}

export default function TabBar({ state, navigation }: TabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "web" ? 0 : insets.bottom;

  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
      {TABS.map((tab) => {
        const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
        const route = state.routes[routeIndex];
        const active = routeIndex !== -1 && state.index === routeIndex;
        const color  = active ? colors.primary : colors.mutedForeground;

        const onPress = () => {
          Haptics.selectionAsync();
          if (route) {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!active && !event.defaultPrevented) navigation.navigate(tab.name);
          } else {
            navigation.navigate(tab.name);
          }
        };

        return (
          <Pressable key={tab.name} style={styles.tab} onPress={onPress}>
            {active && (
              <View style={[styles.activeLine, { backgroundColor: colors.primary }]} />
            )}
            <Feather name={tab.icon} size={16} color={color} />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    gap: 2,
    position: "relative",
  },
  activeLine: {
    position: "absolute",
    top: -6,
    left: "20%",
    right: "20%",
    height: 2,
    borderRadius: 1,
  },
  label: {
    fontSize: 8,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
});
