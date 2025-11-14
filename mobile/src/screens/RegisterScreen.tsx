import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import TextField from "../components/TextField";
import PrimaryButton from "../components/PrimaryButton";
import { useAuthContext } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { register } = useAuthContext();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    try {
      // 验证输入
      if (!email.trim()) {
        Alert.alert("错误", "请输入邮箱");
        return;
      }
      if (!password.trim()) {
        Alert.alert("错误", "请输入密码");
        return;
      }
      if (password.length < 8) {
        Alert.alert("错误", "密码至少需要 8 个字符");
        return;
      }
      if (!displayName.trim()) {
        Alert.alert("错误", "请输入显示名称");
        return;
      }

      setLoading(true);
      await register(email.trim(), password, displayName.trim());
    } catch (error) {
      console.error("Register error:", error);
      // 更详细的错误信息
      if (error instanceof Error) {
        Alert.alert(
          "注册失败",
          error.message || "请检查输入信息"
        );
      } else {
        Alert.alert(
          "注册失败",
          "请检查输入信息"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>创建账号 / Create account</Text>
        <Text style={styles.subtitle}>
          通过邮箱使用 AllCall，开启实时通信
        </Text>
      </View>
      <View style={styles.form}>
        <TextField
          label="显示名称 / Display name"
          autoCapitalize="words"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextField
          label="邮箱 / Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          label="密码 / Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <PrimaryButton
          title={loading ? "注册中..." : "注册 / Register"}
          onPress={handleRegister}
          disabled={loading}
        />
        <TouchableOpacity
          onPress={() => navigation.pop()}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>已有账号？登录 / Already have one?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 24,
    paddingTop: 48
  },
  header: {
    marginBottom: 36
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2937"
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
    lineHeight: 22
  },
  form: {
    flex: 1
  },
  linkButton: {
    marginTop: 16,
    alignItems: "center"
  },
  linkText: {
    color: "#2563eb",
    fontWeight: "600"
  }
});

export default RegisterScreen;
