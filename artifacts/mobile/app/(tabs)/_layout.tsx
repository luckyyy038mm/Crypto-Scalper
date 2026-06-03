import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";

import NavigationDrawer from "@/components/NavigationDrawer";
import TabBar from "@/components/TabBar";
import { CoinProvider } from "@/context/CoinContext";
import { DrawerProvider } from "@/context/DrawerContext";
import { TradingProvider } from "@/context/TradingContext";

export default function TabLayout() {
  return (
    <CoinProvider>
    <TradingProvider>
      <DrawerProvider>
        <View style={{ flex: 1 }}>
          <Tabs
            screenOptions={{ headerShown: false }}
            tabBar={(props) => <TabBar {...(props as any)} />}
          >
            <Tabs.Screen name="index"    options={{ title: "Home" }} />
            <Tabs.Screen name="analysis" options={{ title: "Analysis" }} />
            <Tabs.Screen name="triggers" options={{ title: "Triggers" }} />
            <Tabs.Screen name="plan"     options={{ title: "Plan" }} />
            <Tabs.Screen name="funding"  options={{ title: "Funding" }} />
            <Tabs.Screen name="alerts"    options={{ title: "Alerts" }} />
            <Tabs.Screen name="history"  options={{ title: "History" }} />
            <Tabs.Screen name="liquidity" options={{ title: "Liquidity" }} />
            <Tabs.Screen name="flow"     options={{ href: null }} />
          </Tabs>
          <NavigationDrawer />
        </View>
      </DrawerProvider>
    </TradingProvider>
    </CoinProvider>
  );
}
