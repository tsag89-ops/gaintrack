// Native: plain View wrapper
import React from 'react';
import { View } from 'react-native';

export default function FormWrapper({
  style,
  onSubmit: _onSubmit,
  children,
}: {
  style?: any;
  onSubmit?: () => void;
  children: React.ReactNode;
}) {
  return <View style={style}>{children}</View>;
}
