/** Small set of UI primitives so the app looks consistent without pulling in a UI kit. */
import React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, font, radius, spacing } from '../theme';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const body = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.scrollContent}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
  return <View style={styles.screen}>{body}</View>;
}

export function BrandHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.brandHeader}>
      <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.brandTitle}>{title}</Text>
      {subtitle ? <Text style={styles.brandSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <View style={styles.divider} />;
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  right?: React.ReactNode;
};

/** Labelled text input with inline validation styling. */
export function Field({ label, error, hint, right, style, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrapper, !!error && styles.inputWrapperError]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textFaint}
          {...inputProps}
        />
        {right ? <View style={styles.inputRight}>{right}</View> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.brand} />
      ) : (
        <Text style={[styles.buttonLabel, variant !== 'primary' && styles.buttonLabelAlt]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Banner({
  tone,
  title,
  message,
  action,
}: {
  tone: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const palette = {
    error: { bg: colors.dangerSoft, border: colors.danger, text: colors.danger },
    success: { bg: colors.successSoft, border: colors.success, text: colors.success },
    warning: { bg: colors.warningSoft, border: colors.warning, text: colors.warning },
    info: { bg: colors.brandSoft, border: colors.brand, text: colors.brandDark },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      {title ? <Text style={[styles.bannerTitle, { color: palette.text }]}>{title}</Text> : null}
      <Text style={[styles.bannerMessage, { color: palette.text }]}>{message}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={[styles.bannerAction, { color: palette.text }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LinkText({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={styles.link}>{children}</Text>
    </Pressable>
  );
}

export function ServerFooter({ url, onPress }: { url: string; onPress: () => void }) {
  const host = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.serverFooter}>
      <Text style={styles.serverFooterText} numberOfLines={1}>
        Server: {host}
      </Text>
      <Text style={styles.serverFooterAction}>Change</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },

  brandHeader: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 76, height: 76, borderRadius: 20, marginBottom: spacing.md },
  brandTitle: { fontSize: font.title, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  brandSubtitle: {
    fontSize: font.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 21,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#0B1F17',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: font.label,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerLabel: { marginHorizontal: spacing.md, color: colors.textFaint, fontSize: font.small },

  field: { marginBottom: spacing.lg },
  fieldLabel: { fontSize: font.label, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.sm },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  inputWrapperError: { borderColor: colors.danger },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 11,
    fontSize: font.body,
    color: colors.text,
  },
  inputRight: { paddingRight: spacing.md },
  fieldError: { color: colors.danger, fontSize: font.small, marginTop: spacing.xs },
  fieldHint: { color: colors.textFaint, fontSize: font.small, marginTop: spacing.xs },

  button: {
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  buttonDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { color: '#fff', fontSize: font.body, fontWeight: '700' },
  buttonLabelAlt: { color: colors.text },

  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  bannerTitle: { fontWeight: '700', marginBottom: spacing.xs, fontSize: font.body },
  bannerMessage: { fontSize: font.label, lineHeight: 19 },
  bannerAction: { fontWeight: '700', marginTop: spacing.sm, textDecorationLine: 'underline', fontSize: font.label },

  link: { color: colors.brandDark, fontWeight: '600', fontSize: font.label },

  serverFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  serverFooterText: { color: colors.textFaint, fontSize: font.small, maxWidth: '75%' },
  serverFooterAction: { color: colors.brandDark, fontSize: font.small, fontWeight: '700' },
});

export const uiStyles = styles;
