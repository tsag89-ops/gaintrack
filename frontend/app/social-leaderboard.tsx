import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useLanguage } from '../src/context/LanguageContext';
import { usePro } from '../src/hooks/usePro'; // [PRO]
import { socialApi, LeaderboardEntry, FriendProfile, FriendInvite } from '../src/services/social'; // [PRO]
import { sendPaywallTelemetry, sendSocialEventTelemetry } from '../src/services/notifications';

const INVITE_REMINDER_MIN_HOURS = 24;

export default function SocialLeaderboardScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isPro } = usePro(); // [PRO]
  const [friendIdInput, setFriendIdInput] = useState('');
  const [discoverInput, setDiscoverInput] = useState('');
  const [discoverResults, setDiscoverResults] = useState<FriendProfile[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<FriendInvite[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<FriendInvite[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reminderDueCount, setReminderDueCount] = useState(0);
  const [sendingReminder, setSendingReminder] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    const [leaderboardPayload, invitePayload, reminderPreview] = await Promise.all([
      socialApi.getPrivateLeaderboard(30),
      socialApi.getFriendInvites(),
      socialApi.processInviteReminders(true, INVITE_REMINDER_MIN_HOURS),
    ]);
    setLeaderboard(leaderboardPayload?.leaderboard ?? []);
    setIncomingInvites(invitePayload.incoming ?? []);
    setOutgoingInvites(invitePayload.outgoing ?? []);
    setReminderDueCount(reminderPreview?.due_count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isPro) {
      loadLeaderboard();
    } else {
      setLoading(false);
    }
  }, [isPro, loadLeaderboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  };

  const handleAddFriend = async () => {
    if (!isPro) {
      Alert.alert(t('socialLeaderboard.proFeatureTitle'), t('socialLeaderboard.proFeatureMessage'));
      return;
    }

    const friendId = friendIdInput.trim();
    if (!friendId) {
      Alert.alert(t('socialLeaderboard.missingUserIdTitle'), t('socialLeaderboard.missingUserIdMessage'));
      return;
    }

    await Haptics.selectionAsync();
    const ok = await socialApi.connectFriend(friendId);
    if (!ok) {
      Alert.alert(t('socialLeaderboard.couldNotConnectTitle'), t('socialLeaderboard.couldNotConnectMessage'));
      return;
    }

    setFriendIdInput('');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await loadLeaderboard();
  };

  const handleDiscover = async () => {
    if (!isPro) return;
    const q = discoverInput.trim();
    if (!q) {
      setDiscoverResults([]);
      return;
    }

    await Haptics.selectionAsync();
    const results = await socialApi.discoverFriends(q);
    setDiscoverResults(results);
  };

  const handleSendInvite = async (userId: string) => {
    await Haptics.selectionAsync();
    const ok = await socialApi.inviteFriend(userId);
    if (!ok) {
      Alert.alert(t('socialLeaderboard.inviteFailedTitle'), t('socialLeaderboard.inviteFailedMessage'));
      return;
    }
    sendSocialEventTelemetry({
      eventType: 'friend_invite_sent',
      context: userId,
    }).catch(() => null);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await loadLeaderboard();
  };

  const handleRespondInvite = async (inviteId: string, action: 'accept' | 'decline') => {
    await Haptics.selectionAsync();
    const ok = await socialApi.respondToInvite(inviteId, action);
    if (!ok) {
      Alert.alert(t('socialLeaderboard.actionFailedTitle'), t('socialLeaderboard.actionFailedMessage'));
      return;
    }
    sendSocialEventTelemetry({
      eventType: action === 'accept' ? 'friend_invite_accepted' : 'friend_invite_declined',
      context: inviteId,
    }).catch(() => null);
    await loadLeaderboard();
  };

  const handleSendPendingInviteReminders = async () => {
    setSendingReminder(true);
    await Haptics.selectionAsync();

    const result = await socialApi.processInviteReminders(false, INVITE_REMINDER_MIN_HOURS);
    setSendingReminder(false);

    if (!result) {
      Alert.alert(t('socialLeaderboard.reminderFailedTitle'), t('socialLeaderboard.reminderFailedMessage'));
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const sent = result.reminders_marked;
    Alert.alert(
      t('socialLeaderboard.inviteRemindersProcessedTitle'),
      sent > 0
        ? t('socialLeaderboard.inviteRemindersProcessedMessage', {
            count: sent,
            suffix: sent === 1 ? '' : t('socialLeaderboard.pluralSuffix'),
          })
        : t('socialLeaderboard.noPendingInvitesForRemindersMessage'),
    );
    await loadLeaderboard();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{t('socialLeaderboard.headerTitle')}</Text>
          <Text style={styles.headerSubtitle}>{t('socialLeaderboard.headerSubtitle')}</Text>
        </View>
      </View>

      {!isPro ? (
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed-outline" size={52} color="#6B7280" />
          <Text style={styles.emptyTitle}>{t('socialLeaderboard.proFeatureTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('socialLeaderboard.proGateSubtitle')}</Text>
          <TouchableOpacity
            style={styles.goProButton}
            onPress={() => {
              sendPaywallTelemetry({
                feature: 'social_leaderboard',
                placement: 'social_leaderboard_gate',
                eventType: 'cta_click',
                context: 'go_pro',
              }).catch(() => null);
              router.push('/pro-paywall');
            }}
          >
            <Text style={styles.goProText}>{t('socialLeaderboard.goProButton')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.connectCard}>
            <Text style={styles.cardTitle}>{t('socialLeaderboard.addFriendByUserIdTitle')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={t('socialLeaderboard.friendUserIdPlaceholder')}
                placeholderTextColor="#6B7280"
                value={friendIdInput}
                onChangeText={setFriendIdInput}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.addButton} onPress={handleAddFriend}>
                <Ionicons name="person-add-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.connectCard}>
            <Text style={styles.cardTitle}>{t('socialLeaderboard.discoverAthletesTitle')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={t('socialLeaderboard.discoverPlaceholder')}
                placeholderTextColor="#6B7280"
                value={discoverInput}
                onChangeText={setDiscoverInput}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.addButton} onPress={handleDiscover}>
                <Ionicons name="search-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {discoverResults.map((candidate) => (
              <View key={candidate.user_id} style={styles.discoveryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nameText}>{candidate.name || t('socialLeaderboard.athleteFallback')}</Text>
                  <Text style={styles.metaText}>{candidate.user_id}</Text>
                </View>
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => handleSendInvite(candidate.user_id)}
                >
                  <Text style={styles.inviteButtonText}>{t('socialLeaderboard.inviteButton')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {incomingInvites.length > 0 ? (
            <View style={styles.connectCard}>
              <Text style={styles.cardTitle}>{t('socialLeaderboard.incomingInvitesTitle')}</Text>
              <Text style={styles.nudgeText}>{t('socialLeaderboard.incomingInvitesNudge')}</Text>
              {incomingInvites.map((invite) => (
                <View key={invite.invite_id} style={styles.discoveryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameText}>{invite.from_user_id}</Text>
                    <Text style={styles.metaText}>{t('socialLeaderboard.pendingInviteStatus')}</Text>
                  </View>
                  <View style={styles.inviteActionRow}>
                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => handleRespondInvite(invite.invite_id, 'accept')}
                    >
                      <Text style={styles.inviteButtonText}>{t('socialLeaderboard.acceptButton')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineButton}
                      onPress={() => handleRespondInvite(invite.invite_id, 'decline')}
                    >
                      <Text style={styles.inviteButtonText}>{t('socialLeaderboard.declineButton')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {outgoingInvites.length > 0 ? (
            <View style={styles.connectCard}>
              <View style={styles.outgoingHeaderRow}>
                <Text style={styles.cardTitle}>{t('socialLeaderboard.outgoingInvitesTitle')}</Text>
                <TouchableOpacity
                  style={[styles.reminderButton, sendingReminder && styles.reminderButtonDisabled]}
                  onPress={handleSendPendingInviteReminders}
                  disabled={sendingReminder}
                >
                  <Text style={styles.reminderButtonText}>
                    {sendingReminder ? t('socialLeaderboard.sendingLabel') : t('socialLeaderboard.sendReminderButton')}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.nudgeText}>
                {reminderDueCount > 0
                  ? t('socialLeaderboard.invitesDueForFollowUpMessage', {
                      count: reminderDueCount,
                      suffix: reminderDueCount === 1 ? '' : t('socialLeaderboard.pluralSuffix'),
                    })
                  : t('socialLeaderboard.noFollowUpRemindersDueYet')}
              </Text>
              {outgoingInvites.map((invite) => (
                <View key={invite.invite_id} style={styles.discoveryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameText}>{invite.to_user_id}</Text>
                    <Text style={styles.metaText}>{t('socialLeaderboard.waitingForResponseStatus')}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <FlatList
            data={leaderboard}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6200" />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#2D2D2D" />
                <Text style={styles.emptyTitle}>
                  {loading ? t('socialLeaderboard.loadingLeaderboardTitle') : t('socialLeaderboard.noEntriesYetTitle')}
                </Text>
                <Text style={styles.emptySubtitle}>{t('socialLeaderboard.emptyLeaderboardSubtitle')}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.row, item.is_you && styles.youRow]}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{item.rank}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nameText}>
                    {item.name}
                    {item.is_you ? t('socialLeaderboard.youSuffix') : ''}
                  </Text>
                  <Text style={styles.metaText}>
                    {t('socialLeaderboard.workoutsSetsSummary', {
                      workouts: item.total_workouts,
                      sets: item.total_sets,
                    })}
                  </Text>
                </View>
                <Text style={styles.volumeText}>{t('socialLeaderboard.volumeKg', { volume: Math.round(item.total_volume) })}</Text>
              </View>
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  backButton: { padding: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  headerSubtitle: { color: '#B0B0B0', fontSize: 13, marginTop: 2 },
  connectCard: {
    backgroundColor: '#252525',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  nudgeText: { color: '#B0B0B0', fontSize: 12, marginTop: -2, marginBottom: 8 },
  outgoingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  reminderButton: {
    backgroundColor: '#FF6200',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reminderButtonDisabled: {
    opacity: 0.65,
  },
  reminderButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FF6200',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inviteButton: {
    backgroundColor: '#FF6200',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inviteButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  inviteActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  declineButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 28 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 12,
    marginTop: 8,
    gap: 10,
  },
  youRow: { borderColor: '#FF6200' },
  rankBadge: {
    minWidth: 40,
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 5,
    alignItems: 'center',
  },
  rankText: { color: '#FF6200', fontSize: 13, fontWeight: '800' },
  nameText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  metaText: { color: '#B0B0B0', fontSize: 12, marginTop: 2 },
  volumeText: { color: '#4CAF50', fontSize: 14, fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 14 },
  emptySubtitle: { color: '#B0B0B0', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  goProButton: {
    marginTop: 18,
    backgroundColor: '#FF6200',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  goProText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
