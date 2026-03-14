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
import { usePro } from '../src/hooks/usePro'; // [PRO]
import { socialApi, LeaderboardEntry, FriendProfile, FriendInvite } from '../src/services/social'; // [PRO]

export default function SocialLeaderboardScreen() {
  const router = useRouter();
  const { isPro } = usePro(); // [PRO]
  const [friendIdInput, setFriendIdInput] = useState('');
  const [discoverInput, setDiscoverInput] = useState('');
  const [discoverResults, setDiscoverResults] = useState<FriendProfile[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<FriendInvite[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<FriendInvite[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    const [leaderboardPayload, invitePayload] = await Promise.all([
      socialApi.getPrivateLeaderboard(30),
      socialApi.getFriendInvites(),
    ]);
    setLeaderboard(leaderboardPayload?.leaderboard ?? []);
    setIncomingInvites(invitePayload.incoming ?? []);
    setOutgoingInvites(invitePayload.outgoing ?? []);
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
      Alert.alert('Pro Feature', 'Private leaderboard is available with GainTrack Pro.');
      return;
    }

    const friendId = friendIdInput.trim();
    if (!friendId) {
      Alert.alert('Missing User ID', 'Enter a friend user ID to connect.');
      return;
    }

    await Haptics.selectionAsync();
    const ok = await socialApi.connectFriend(friendId);
    if (!ok) {
      Alert.alert('Could not connect', 'Check the friend ID and try again.');
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
      Alert.alert('Invite failed', 'Could not send invite right now.');
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await loadLeaderboard();
  };

  const handleRespondInvite = async (inviteId: string, action: 'accept' | 'decline') => {
    await Haptics.selectionAsync();
    const ok = await socialApi.respondToInvite(inviteId, action);
    if (!ok) {
      Alert.alert('Action failed', 'Could not update invite status.');
      return;
    }
    await loadLeaderboard();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Private Leaderboard</Text>
          <Text style={styles.headerSubtitle}>Friends-only monthly ranking</Text>
        </View>
      </View>

      {!isPro ? (
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed-outline" size={52} color="#6B7280" />
          <Text style={styles.emptyTitle}>Pro Feature</Text>
          <Text style={styles.emptySubtitle}>Upgrade to GainTrack Pro to access private friends leaderboard.</Text>
          <TouchableOpacity style={styles.goProButton} onPress={() => router.push('/pro-paywall')}>
            <Text style={styles.goProText}>Go Pro</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.connectCard}>
            <Text style={styles.cardTitle}>Add Friend by User ID</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="friend_user_id"
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
            <Text style={styles.cardTitle}>Discover Athletes</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Search name, email, or user ID"
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
                  <Text style={styles.nameText}>{candidate.name || 'Athlete'}</Text>
                  <Text style={styles.metaText}>{candidate.user_id}</Text>
                </View>
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => handleSendInvite(candidate.user_id)}
                >
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {incomingInvites.length > 0 ? (
            <View style={styles.connectCard}>
              <Text style={styles.cardTitle}>Incoming Invites</Text>
              {incomingInvites.map((invite) => (
                <View key={invite.invite_id} style={styles.discoveryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameText}>{invite.from_user_id}</Text>
                    <Text style={styles.metaText}>Pending invite</Text>
                  </View>
                  <View style={styles.inviteActionRow}>
                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => handleRespondInvite(invite.invite_id, 'accept')}
                    >
                      <Text style={styles.inviteButtonText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineButton}
                      onPress={() => handleRespondInvite(invite.invite_id, 'decline')}
                    >
                      <Text style={styles.inviteButtonText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {outgoingInvites.length > 0 ? (
            <View style={styles.connectCard}>
              <Text style={styles.cardTitle}>Outgoing Invites</Text>
              {outgoingInvites.map((invite) => (
                <View key={invite.invite_id} style={styles.discoveryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameText}>{invite.to_user_id}</Text>
                    <Text style={styles.metaText}>Waiting for response</Text>
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
                <Text style={styles.emptyTitle}>{loading ? 'Loading leaderboard...' : 'No entries yet'}</Text>
                <Text style={styles.emptySubtitle}>Connect with a friend and complete workouts to appear here.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.row, item.is_you && styles.youRow]}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{item.rank}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nameText}>{item.name}{item.is_you ? ' (You)' : ''}</Text>
                  <Text style={styles.metaText}>{item.total_workouts} workouts • {item.total_sets} sets</Text>
                </View>
                <Text style={styles.volumeText}>{Math.round(item.total_volume)} kg</Text>
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
