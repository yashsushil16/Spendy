import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface CategoryIconProps {
  categoryId?: string | null;
  type?: 'debit' | 'credit';
  size?: number;
  color?: string;
  backgroundColor?: string;
  containerSize?: number;
}

const CATEGORY_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  cat_food: 'coffee',
  cat_transport: 'navigation',
  cat_shopping: 'shopping-bag',
  cat_health: 'heart',
  cat_entertainment: 'film',
  cat_bills: 'zap',
  cat_education: 'book',
  cat_other: 'box',
  food: 'coffee',
  transport: 'navigation',
  shopping: 'shopping-bag',
  health: 'heart',
  entertainment: 'film',
  bills: 'zap',
  utilities: 'zap',
  education: 'book',
  groceries: 'shopping-cart',
  travel: 'send',
  salary: 'download',
  investment: 'trending-up',
};

export default function CategoryIcon({
  categoryId,
  type,
  size = 16,
  color = '#0A0A0A',
  backgroundColor,
  containerSize,
}: CategoryIconProps) {
  let iconName: keyof typeof Feather.glyphMap = 'box';

  if (categoryId && CATEGORY_MAP[categoryId.toLowerCase()]) {
    iconName = CATEGORY_MAP[categoryId.toLowerCase()];
  } else if (type === 'debit') {
    iconName = 'arrow-up-right';
  } else if (type === 'credit') {
    iconName = 'arrow-down-left';
  }

  if (containerSize) {
    return (
      <View
        style={[
          styles.container,
          {
            width: containerSize,
            height: containerSize,
            borderRadius: containerSize / 2,
            backgroundColor: backgroundColor ?? Colors.backgroundMuted,
          },
        ]}
      >
        <Feather name={iconName} size={size} color={color} />
      </View>
    );
  }

  return <Feather name={iconName} size={size} color={color} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
