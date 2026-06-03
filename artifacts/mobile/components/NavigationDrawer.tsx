import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DRAWER_WIDTH, useDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

interface NavItem {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  sublabel: string;
  route: string;
  isExternal?: boolean;
}

const MAIN_ITEMS: NavItem[] = [
  { icon: "home",        label: "Home",                sublabel: "Live signals & chart",              route: "/(tabs)/" },
  { icon: "layers",      label: "Liquidity",           sublabel: "Order book depth & pressure",       route: "/(tabs)/liquidity" },
  { icon: "bar-chart-2", label: "Chart Analysis",      sublabel: "Independent charting workspace",    route: "/chart-analysis" },
  { icon: "activity",    label: "Order Flow",          sublabel: "Aggressive flow & delta analysis",  route: "/order-flow" },
  { icon: "grid",        label: "Footprint Chart",     sublabel: "Bid/ask volume at each price level", route: "/footprint" },
];

const STATS_ITEMS: NavItem[] = [
  { icon: "book",      label: "Trade Journal",   sublabel: "Log & review your trades",     route: "/journal" },
  { icon: "activity",  label: "Performance",     sublabel: "Stats, streaks & analytics",   route: "/performance" },
  { icon: "cpu",       label: "Paper Trading",   sublabel: "Test signals, no real funds",  route: "/paper-trading" },
];

const FUTURE_ITEMS: NavItem[] = [
  { icon: "settings",  label: "Settings",            sublabel: "Coming soon",                 route: "", isExternal: true },
  { icon: "user",      label: "Account",             sublabel: "Coming soon",                 route: "", isExternal: true },
];

export default function NavigationDrawer() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { isOpen, anim, closeDrawer } = useDrawer();

  if (!isOpen) return null;

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0],
  });

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  const handleNav = (item: NavItem) => {
    if (item.isExternal || !item.route) return;
    Haptics.selectionAsync();
    closeDrawer();
    setTimeout(() => router.push(item.route as any), 50);
  };

  const topPad = Platform.OS === "web" ? 24 : insets.top;

  const renderSection = (title: string, items: NavItem[], dimmed?: boolean) => (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
      {items.map((item) => (
        <Pressable
          key={item.label}
          onPress={() => handleNav(item)}
          style={({ pressed }) => [
            styles.navItem,
            { backgroundColor: pressed && !item.isExternal ? colors.secondary : "transparent" },
            dimmed && styles.navItemDimmed,
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: item.isExternal ? colors.border + "60" : colors.primary + "18" }]}>
            <Feather name={item.icon} size={16} color={item.isExternal ? colors.mutedForeground : colors.primary} />
          </View>
          <View style={styles.navText}>
            <Text style={[styles.navLabel, { color: item.isExternal ? colors.mutedForeground : colors.foreground }]}>
              {item.label}
            </Text>
            <Text style={[styles.navSub, { color: colors.mutedForeground }]}>{item.sublabel}</Text>
          </View>
          {item.isExternal ? (
            <View style={[styles.comingSoon, { borderColor: colors.border }]}>
              <Text style={[styles.comingSoonText, { color: colors.mutedForeground }]}>Soon</Text>
            </View>
          ) : (
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          )}
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={closeDrawer}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: DRAWER_WIDTH,
            backgroundColor: colors.card,
            borderRightColor: colors.border,
            paddingTop: topPad,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.drawerHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.appInfo}>
            <View style={[styles.logoBox, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}>
              <Text style={[styles.logoText, { color: colors.primary }]}>₿</Text>
            </View>
            <View>
              <Text style={[styles.appName, { color: colors.foreground }]}>BTC Scalper</Text>
              <Text style={[styles.appSub, { color: colors.mutedForeground }]}>BTC/USDT · PERP</Text>
            </View>
          </View>
          <Pressable onPress={closeDrawer} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Navigation items */}
        <View style={styles.nav}>
          {renderSection("TRADING", MAIN_ITEMS)}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {renderSection("STATISTICS & MANAGEMENT", STATS_ITEMS)}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {renderSection("ACCOUNT", FUTURE_ITEMS, true)}
        </View>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Not financial advice · For informational use only
          </Text>
          <Text style={[styles.footerVersion, { color: colors.mutedForeground }]}>v1.0.0</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    borderRightWidth: 1,
    flexDirection: "column",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  appInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  appName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  appSub: { fontSize: 10, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
  closeBtn: { padding: 4 },

  nav: { flex: 1, paddingTop: 8 },
  section: { paddingHorizontal: 12, paddingVertical: 8 },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 2,
  },
  navItemDimmed: { opacity: 0.55 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: { flex: 1, gap: 1 },
  navLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  navSub:   { fontSize: 10, fontFamily: "Inter_400Regular" },
  comingSoon: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  comingSoonText: { fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

  divider: { height: 1, marginHorizontal: 16, marginVertical: 4 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 2,
  },
  footerText: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  footerVersion: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
});
