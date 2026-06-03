import { Feather } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  explanation: string;
}

export default function TraderExplanationCard({ explanation }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = expanded ? 0 : 1;
    Animated.timing(rotateAnim, {
      toValue,
      duration: 200,
      useNativeDriver: false,
    }).start();
    setExpanded(!expanded);
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  if (!explanation) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Pressable style={styles.header} onPress={toggle}>
        <View style={styles.headerLeft}>
          <Feather name="help-circle" size={14} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground }]}>
            Why is the app saying this?
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
        </Animated.View>
      </Pressable>

      {expanded && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {explanation.split("\n\n").map((para, i) => (
            <Text
              key={i}
              style={[styles.para, { color: colors.secondaryForeground }]}
            >
              {para}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1 },
  para: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21 },
});
