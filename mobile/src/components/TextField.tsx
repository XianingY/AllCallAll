import React from "react";
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  Text
} from "react-native";

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
}

const TextField: React.FC<Props> = ({ label, error, style, ...props }) => {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor="#9ca3af"
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12
  },
  label: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 6
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderColor: "#d1d5db",
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: "#fff"
  },
  error: {
    color: "#dc2626",
    fontSize: 12,
    marginTop: 4
  }
});

export default TextField;
