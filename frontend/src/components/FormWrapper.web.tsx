// Web: renders as a real <form> element so browsers recognise password fields,
// enable autofill and password-manager save prompts.
import React from 'react';
import { StyleSheet } from 'react-native';

export default function FormWrapper({
  style,
  onSubmit,
  children,
}: {
  style?: any;
  onSubmit?: () => void;
  children: React.ReactNode;
}) {
  return (
    // @ts-ignore — <form> is a valid DOM element in React Native Web / Expo Web
    <form
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        onSubmit?.();
      }}
      style={StyleSheet.flatten(style) as React.CSSProperties}
    >
      {children}
    </form>
  );
}
