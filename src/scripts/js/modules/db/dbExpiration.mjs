/**
 * Database Expiration Warning Utilities
 * Calculates and formats the database expiration date for display
 */

/**
 * Calculate days remaining until database expiration
 * @returns {Object} Object with daysRemaining and expirationDate
 */
export function getDbExpirationInfo() {
  const expirationDateStr = process.env.DB_PG_EXPIRE;

  if (!expirationDateStr) {
    return {
      daysRemaining: null,
      expirationDate: null,
      status: 'unknown',
    };
  }

  try {
    const expirationDate = new Date(expirationDateStr);
    const today = new Date();

    // Set to start of day for accurate day count
    today.setHours(0, 0, 0, 0);
    expirationDate.setHours(0, 0, 0, 0);

    const daysRemaining = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));

    let status = 'safe';
    if (daysRemaining <= 0) {
      status = 'expired';
    } else if (daysRemaining === 1) {
      status = 'critical-1day';
    } else if (daysRemaining <= 3) {
      status = 'critical';
    } else if (daysRemaining <= 10) {
      status = 'warning';
    }

    return {
      daysRemaining,
      expirationDate: expirationDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      status,
    };
  } catch (error) {
    console.error('Error parsing DB expiration date:', error);
    return {
      daysRemaining: null,
      expirationDate: null,
      status: 'unknown',
    };
  }
}

/**
 * Get warning message based on days remaining
 * @returns {Object} Object with message and level
 */
export function getExpirationWarning() {
  const info = getDbExpirationInfo();

  if (info.status === 'safe' || info.status === 'unknown') {
    return { message: null, level: null };
  }

  if (info.status === 'expired') {
    return {
      message: `⚠️ DATABASE EXPIRED - Expires: ${info.expirationDate}. Contact support immediately!`,
      level: 'expired',
    };
  }

  if (info.status === 'critical-1day') {
    return {
      message: `🚨 DATABASE EXPIRES IN 1 DAY - ${info.expirationDate}. Action required immediately!`,
      level: 'critical-1day',
    };
  }

  if (info.status === 'critical') {
    return {
      message: `🔴 DATABASE EXPIRES IN ${info.daysRemaining} DAYS - ${info.expirationDate}. Action needed soon!`,
      level: 'critical',
    };
  }

  if (info.status === 'warning') {
    return {
      message: `⚠️ DATABASE EXPIRES IN ${info.daysRemaining} DAYS - ${info.expirationDate}`,
      level: 'warning',
    };
  }

  return { message: null, level: null };
}
