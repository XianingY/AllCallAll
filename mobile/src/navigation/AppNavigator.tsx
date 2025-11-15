import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";

import { useAuthContext } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import ContactsScreen from "../screens/ContactsScreen";

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Contacts: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const LoadingFallback = () => (
  <View
    style={{
      flex: 1,
      justifyContent: "center",
      alignItems: "center"
    }}
  >
    <ActivityIndicator size="large" />
  </View>
);

const AppNavigator: React.FC = () => {
  const { token, loading } = useAuthContext();

  if (loading) {
    return <LoadingFallback />;
  }

  return (
    <Stack.Navigator>
      {token ? (
        <Stack.Screen
          name="Contacts"
          component={ContactsScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Login"
            component= {LoginScreen}
            options={{ title: "AllCallAll 登录 / Login" }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ title: "AllCallAll 注册 / Register" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
